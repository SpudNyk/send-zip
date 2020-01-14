import jp from 'fs-jetpack';
import send from 'send';
import { extract, open, entry, close } from './zip';

export const sendZipContent = async (
    zipFile,
    contents,
    path,
    req,
    res,
    depth = 0
) => {
    if (path === '' || path.endsWith('/')) {
        // a directory try sending default
        return sendZipContent(
            zipFile,
            contents,
            path + 'index.html',
            req,
            res,
            depth
        );
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
    const zip = open(zipFile);
    const zipEntry = await entry(zip, path, depth);
    if (!zipEntry) {
        close(zip);
        res.sendStatus(404);
        return;
    }
    if (zipEntry.isDirectory) {
        res.redirect(path + '/');
        close(zip);
        return;
    } else {
        const file = jp.cwd(contents, path);
        if (!(await file.existsAsync('.'))) {
            // ensure directory exists
            await file.dirAsync('..');
            await extract(zip, zipEntry, file.path());
        }
        close(zip);
        // send the file
        send(req, path, {
            root: contents
        }).pipe(res);
        return;
    }
};

export default sendZipContent;
