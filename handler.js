import express from 'express';
import jp from 'fs-jetpack';
import ZipStream from 'node-stream-zip';
import he from 'he';
import pm from 'path';
import wrap from './async-handler';
import send from 'send';

const zipReady = zip => {
    return new Promise((resolve, reject) => {
        const handleError = err => {
            reject(err);
        };

        zip.once('ready', () => {
            zip.off('error', handleError);
            resolve(zip);
        });
    });
};

const normPath = path => path.replace('\\', '/');

const zipEntry = (zip, name) => {
    return new Promise((resolve, reject) => {
        const find = normPath(name);
        const handleError = err => {
            reject(err);
        };

        const handleEntry = entry => {
            if (normPath(entry.name) === find) {
                zip.off('ready', handleNotFound);
                zip.off('error', handleError);
                resolve(entry);
            }
        };

        const handleNotFound = () => {
            zip.off('error', handleError);
            resolve(undefined);
        };
        zip.on('error', handleError);
        zip.on('ready', handleNotFound);
        zip.on('entry', handleEntry);
    });
};

const zipExtract = (zip, entry, dest) => {
    return new Promise((resolve, reject) => {
        zip.extract(entry, dest, err => {
            console.log(`Extracting: ${entry.name}`);
            if (err) {
                reject(err);
            } else {
                resolve(entry);
            }
        });
    });
};

const sendFromZip = async (zipFile, contents, path, req, res) => {
    if (path === '' || path.endsWith('/')) {
        // a directory try sending default
        return sendFromZip(zipFile, contents, path + 'index.html', req, res);
    }
    const file = jp.cwd(contents, path);
    const exists = await file.existsAsync('.');
    if (exists === 'file') {
        // send the file
        send(req, path, {
            root: contents
        }).pipe(res);
        return;
    }

    const zip = new ZipStream({
        file: zipFile
    });
    const entry = await zipEntry(zip, path);
    if (!entry) {
        zip.close();
        res.sendStatus(404);
        return;
    }

    if (entry.isDirectory) {
        res.redirect(path + '/');
        zip.close();
        return;
    } else {
        const file = jp.cwd(contents, path);
        if (!(await file.existsAsync('.'))) {
            // ensure directory exists
            await file.dirAsync('..');
            await zipExtract(zip, entry, file.path());
        }
        zip.close();
        // send the file
        send(req, path, {
            root: contents
        }).pipe(res);
        return;
    }
};

const zipContentHandler = mount =>
    wrap(async (req, res) => {
        // handle zip file or folder with zip name
        const { name, '0': path } = req.params;
        const zipFile = name + '.zip';
        const info = await mount.existsAsync(zipFile);
        if (info === 'file') {
            // valid zip file
            return sendFromZip(
                mount.path(zipFile),
                mount.path('contents', name),
                path,
                req,
                res
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
    console.log('Instantiating router');
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
