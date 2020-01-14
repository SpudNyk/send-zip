import express from 'express';
import jp from 'fs-jetpack';
import he from 'he';
import pm from 'path';
import wrap from './async-handler';
import send from 'send';
import sendZipContent from './sendZipContent';

const zipContentHandler = mount =>
    wrap(async (req, res) => {
        // handle zip file or folder with zip name
        const { name, '0': path } = req.params;
        const zipFile = name + '.zip';
        const info = await mount.existsAsync(zipFile);
        if (info === 'file') {
            // valid zip file
            return sendZipContent(
                mount.path(zipFile),
                mount.path('contents', name),
                path,
                req,
                res,
                1
            );
        }
        res.send(404);
    });

const zipHandler = mount =>
    wrap(async (req, res) => {
        // handle zip file or folder with zip name
        const { name } = req.params;
        const { type } = await mount.inspectAsync(name);
        const ext = pm.extname(name);
        if (type === 'file') {
            if (ext === '.zip') {
                send(req, '/' + name, {
                    root: mount.path()
                }).pipe(res);
            }
        } else {
            const info = await mount.inspectAsync(name + '.zip');
            if (info && info.type === 'file') {
                res.redirect(name + '/');
                return;
            }
        }
        res.sendStatus(404);
    });

const listHandler = mount =>
    wrap(async (req, res) => {
        const zips = await mount.findAsync({
            matching: '*.zip',
            recursive: false
        });
        res.setHeader('Content-Type', 'text/html');
        res.write('<html><head><title>Files</title></head>');
        res.write('<body><ul>');
        for (const zip of zips) {
            res.write(
                `<li><a href="${encodeURIComponent(zip)}">${he.encode(zip)}</a>`
            );
            res.write(
                `&#160;<a href="${encodeURIComponent(
                    pm.basename(zip, '.zip')
                )}/">(contents)</a></li>`
            );
        }
        res.write('</ul></body>');
        res.end();
    });

export default dataDir => {
    const mount = jp.cwd(dataDir);

    const router = express.Router();
    const handleZipContent = zipContentHandler(mount);
    const handleZip = zipHandler(mount);
    const handleList = listHandler(mount);

    router.head('/:name/*', handleZipContent);
    router.get('/:name/*', handleZipContent);
    router.head('/:name', handleZip);
    router.get('/:name', handleZip);
    router.get('/', handleList);
    return router;
};
