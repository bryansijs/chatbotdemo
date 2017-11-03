const fs = require('fs');

module.exports.logQuery = function (query) {
    fs.appendFile('query-log.txt', query + '\n');
};