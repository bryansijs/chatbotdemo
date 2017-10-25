Essent Chatbot
================
This is a node server that acts like a chatbot using multiple api's:
- LivePerson API
- Microsoft Azure API
- Api.ai/diagflow API

When you start the server with a specifc liveperson agent this agent will connect to liveperson and start to look for incoming chats.
Once a chat comes in it will subscribe to the chat session and first relay incoming chat messages to microsoft azure's sentiment analysis service. If the Sentiment is deemed positive enough it will relay the incoming chat message to google's api.ai (now also known as diagflow) chatbot API. This API will figure out the intent of the user and gives back a predefined answer. This message is then send back to liveperson and thus to the user.  


Prerequisites
=============
- Live Engage Account
- Microsoft Azure Language recognition API Key
- Stuff developers should have (Up to date version of node and npm)

Installation
============
- Run npm install 

Getting Started
===============
1. Run npm start
2. Go to [visitor test page](https://livepersoninc.github.io/visitor-page/?siteid=SiteId), enter your site ID in the url and refresh the page 
3. Click to start chat
4. Send the first message from the visitor test page 
5. Wait for the agent response
6. Follow steps 4 and 5 until the conversation ends
