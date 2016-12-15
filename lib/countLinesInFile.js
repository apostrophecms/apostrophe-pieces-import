// From https://www.npmjs.com/package/count-lines-in-file
// 0.10.x is past EOL but 0.12.x has another month of life so let's just not introduce
// a requirement for "const" for another couple weeks. -Tom

var fs = require('fs');
var split = require('split');

module.exports = (filePath, callback) => {
    var readError,
        lineCount;

    lineCount = 0;

    fs
        .createReadStream(filePath)
        .pipe(split())
        .on('data', (line) => {
            lineCount++;
        })
        .on('end', () => {
            if (readError) {
                return;
            }

            callback(null, lineCount - 1);
        })
        .on('error', (error) => {
            readError = true;

            callback(error);
        });
};