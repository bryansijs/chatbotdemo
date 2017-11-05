var express = require( 'express' );
var router = express.Router();
var utils = require( '../util/utils' );
var amount = 50;
var newAmount = 0;

module.exports = function (  ) {

    router.get('/webhook',function (req,res,next) {
        res.send('hello');
    })

    /* Retrieve Webhook */
    router.post( '/webhook', function ( req, res, next ) {

        if ( !req.body.result ) {
            console.log( '400 ERROR : Body result missing: ' + req.body.result );
            res.status( 400 ).send();
            return;
        }

        var action = req.body.result.action;
        var query = req.body.result.resolvedQuery;
        var answer = req.body.result.fulfillment;
        var newAmount = req.body.result.parameters.unit-currency[0].amount;


        // Log all queries
        utils.logQuery( query );

        var output = {
            "source": "ChatbotBackend"
        };

        console.log( "Action: ", action );
        console.log( "Query: ", query );
        console.log( "Answer: ", answer );

        if ( action === 'ChangeBBA.ChangeBBA-custom' ) {
            output.speech = answer.speech.replace( '[[newAmount]]', newAmount );
            res.json( output );
        }
    });
    return router;
};