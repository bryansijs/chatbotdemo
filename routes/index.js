var express = require( 'express' );
var router = express.Router();
var utils = require( '../util/utils' );
var amount = 50;
var newAmount = 0;

module.exports = function (  ) {



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


        // Log all queries
        utils.logQuery( query );

        var output = {
            "source": "ChatbotBackend"
        };

        console.log( "Action: ", action );
        console.log( "Query: ", query );
        console.log( "Answer: ", answer );

        if ( action === 'budgetbill-change.start' ) {
            output.speech = answer.speech.replace( '[[amount]]', amount );
            res.json( output );
        } else if ( action === 'budgetbill-change-amount.value' ) {
            newAmount = req.body.result.parameters.amount;

            if (parseFloat(amount) && amount > 999) {
                output.speech = 'Sorry, dit bedrag is te hoog. Je termijnbedrag mag niet meer dan 999 euro zijn. Kun je een nieuw bedrag opgeven?';
                output.contextOut = [ { "name": "budgetbill-change-allow", "lifespan": 1 } ];
            } else {
                output.contextOut = [ { "name": "budgetbill-change-confirm", "lifespan": 1, "parameters":{"amount": amount} } ];
            }

            res.json( output );

        } else if ( action === 'budgetbill-change.confirmed' ) {
            var toAmount = Math.round( parseFloat( req.body.result.parameters.amount ) );

            require( '../intents/budget-bill-change-amount-change' )( dbConnection, toAmount ).then( function () {
                output.speech = answer.speech.replace( '[[amount]]', toAmount );
                res.json( output );
            } ).catch( function ( err ) {
                res.status( 500 ).send( err );
            } );

        }});

    function writeNewBBA(userId, bba) {
        firebase.database().ref('/').set({
            bba: bba
        });
    }

    var ref = firebase.database().ref("/");

    ref.once(1, function(data) {
        // do some stuff once
    });


// Attach an asynchronous callback to read the data at our posts reference
    ref.on("value", function(snapshot) {
        console.log(snapshot.val());
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });



    return router;
};