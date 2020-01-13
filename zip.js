import strm from 'stream';
import ZipStream from 'node-stream-zip';
import { promisify } from 'util';

const streamPipeline = promisify(strm.pipeline);

const normPath = path => path.replace('\\', '/');

const stripLeading = (path, depth = 0) => {
    let start = 0;
    for (let i = 0; i < depth; i++) {
        const index = path.indexOf('/', start);
        if (index < 0) {
            return path.slice(start);
        }
        start = index + 1;
    }
    return path.slice(start);
};

export const matcher = (name, depth = 0) => {
    const find = normPath(name);
    return depth === 0
        ? entry => normPath(entry.name) === find
        : entry => stripLeading(normPath(entry.name), depth) === find;
};

export const entry = (zip, name, depth = 0) => {
    return new Promise((resolve, reject) => {
        const match = typeof name === 'function' ? name : matcher(name, depth);
        const handleError = err => {
            cleanup();
            reject(err);
        };
        const handleEntry = entry => {
            if (match(entry, name)) {
                cleanup();
                resolve(entry);
            }
        };
        const handleNotFound = () => {
            cleanup();
            resolve(undefined);
        };
        const cleanup = () => {
            zip.off('entry', handleEntry);
            zip.off('ready', handleNotFound);
            zip.off('error', handleError);
        };
        zip.on('error', handleError);
        zip.on('ready', handleNotFound);
        zip.on('entry', handleEntry);
    });
};

export const forEachEntry = (zip, cb) => {
    return new Promise((resolve, reject) => {
        const handleEntry = entry => {
            try {
                cb(entry);
            } catch (e) {
                cleanup();
                reject(e);
            }
        };

        const cleanup = () => {
            zip.off('entry', handleEntry);
            zip.off('ready', handleReady);
        };

        const handleReady = () => {
            cleanup();
            resolve();
        };

        zip.on('entry', handleEntry);
        zip.on('ready', handleReady);
    });
};

export const entries = async (zip, match) => {
    const matches = [];
    await forEachEntry(zip, entry => {
        if (match(entry)) {
            matches.push(entry);
        }
    });
    return matches;
};

export const stream = (zip, entry) => {
    return new Promise((resolve, reject) => {
        zip.stream(entry, (err, stream) => {
            if (err) {
                reject(err);
            } else {
                resolve(stream);
            }
        });
    });
};

export const pipeline = async (zip, entry, ...streams) =>
    streamPipeline(await stream(zip, entry), ...streams);

export const extract = (zip, entry, dest) => {
    return new Promise((resolve, reject) => {
        zip.extract(entry, dest, err => {
            if (err) {
                reject(err);
            } else {
                resolve(entry);
            }
        });
    });
};

export const ready = zip => {
    return new Promise((resolve, reject) => {
        const handleError = err => {
            cleanup();
            reject(err);
        };
        const handleReady = () => {
            cleanup();
            resolve(zip);
        };
        const cleanup = () => {
            zip.off('error', handleError);
            zip.off('ready', handleReady);
        };
        zip.on('error', handleError);
        zip.on('ready', handleReady);
    });
};

export const open = (file, options) =>
    new ZipStream({
        file,
        storeEntries: false,
        ...options
    });
