import express from 'express';
import fs from 'fs';
import path from 'path';
import spdy from 'spdy';
import handler from './handler';
const app = express();
const port = 9000;

console.log('Adding route');
app.use('/zip-file', handler('./data'));
app.get('/', (req, res) => res.send('This is the root'));

// create your own certificate with openssl for development
const options = {
    key: fs.readFileSync(path.join('./privateKey.key')),
    cert: fs.readFileSync(path.join('./certificate.crt'))
};

app.listen(9000, error => {
    if (error) {
        console.error(error);
    } else {
        console.log(`HTTP server listening on port: ${port}`);
    }
});
