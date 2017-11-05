const agentBot = require('./lib/agentBot');

//TODO: Hardcoded value's to config file or env variables.
// please be nice and dont steal this (:
const agent = new agentBot(63494234, "essentBot", "essent123");
const express = require('express')
const app = express()

var bodyParser = require('body-parser');

//routes

var index = require('./routes/index')();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/', index);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.json({
        message: err.message,
        error: err
    });
});
app.listen(3000);

module.exports = app;

agent.start();
