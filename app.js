var express        = require('express'),
    bodyParser     = require('body-parser'),
    https           = require('https'),
    request        = require('request'),
    app            = express(),
    fs             = require('fs'),
    token          = 'EAAGAkQmzIboBAG7F9PXHVRV8UL6tVWKMfGZAIZBU9VCbHZBRxZAvHKwi0oy8cDgcMFFGzIm30ZAVaNq0nfNdO4RyH7Uj1YfAV2gOa2BsIZB01zlozdmUyweCTASV0fOnKENYqxHqt07ZAb3IacwZAhZAfKQ9bINmeL4mZCLqDwu45FZCgZDZD',
    sslOpts        = {
      "key":fs.readFileSync("/etc/letsencrypt/keys/0000_key-certbot.pem"),
      "cert":fs.readFileSync('/etc/letsencrypt/live/aaronfranco.tk/fullchain.pem')
    },
    url            = "mongodb://aarongfranco:4gFFr4nc0@cluster0-shard-00-00-ctdrj.mongodb.net:27017,cluster0-shard-00-01-ctdrj.mongodb.net:27017,cluster0-shard-00-02-ctdrj.mongodb.net:27017/codementor?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin",
    MongoClient    = require('mongodb').MongoClient

// accept JSON bodies.
app.use(bodyParser.json({}));

// accept incoming messages
app.post('/fb', function(req, res){
  var id = req.body.entry[0].messaging[0].sender.id;
  var text = req.body.entry[0].messaging[0].message.text;
  console.log(JSON.stringify(req.body))
  // here we add the logic to insert the user data into the database
  MongoClient.connect(url, function(err, db) {
    if(err) {
      console.log(err)
    }
    app.findDocument(id, db, function(doc) {
      if(doc === null){
        app.initUserHomework({session:id, homework:[]}, db, function(doc){
          db.close();
        })
      }
    });
  });
  app.speechHandler(text, id, function(speech){
    app.messageHandler(speech, id, function(result){
      console.log("Async Handled: " + result)
    })
  })
  res.send(req.body)
})
app.messageHandler = function(text, id, cb) {
  var data = {
    "recipient":{
    	"id":id
    },
    "message":{
    	"text":text
    }
  };
  var reqObj = {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: data
  };
  console.log(JSON.stringify(reqObj))
  request(reqObj, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', JSON.stringify(error));
      cb(false)
    } else if (response.body.error) {
      console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false)
    } else{
      cb(true)
    }
  });
}
app.speechHandler = function(text, id, cb) {
  var reqObj = {
    url: 'https://api.api.ai/v1/query?v=20150910',
    headers: {
      "Content-Type":"application/json",
      "Authorization":"Bearer 4485bc23469d4607b19a3d9d2d24b112"
    },
    method: 'POST',
    json: {
      "query":text,
      "lang":"en",
      "sessionId":id
    }
  };
  request(reqObj, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', JSON.stringify(error));
      cb(false)
    } else {
      console.log(JSON.stringify(body))
      if(body.result.action === "save"){
        if(body.result.parameters.due !== "" && body.result.parameters.subject !== "")
        {
          // here we have enough information to  save our homework assignment to the database.
          MongoClient.connect(url, function(err, db) {
            if(err) {
              console.log(err)
            }
            app.updateHomework({due:body.result.parameters.due, subject:body.result.parameters.subject}, id, db, function(doc){
              db.close();
            });
          });
        }
      }else if(body.result.action === "list.homework"){
        app.findDocument(id, db, function(doc){
          db.close();
          var iln = doc.homework.length;
          var listItemsArray = [];
          for(var i = 0; i < iln; i++){
            listItemsArray.push(
              {
                    "title": doc.homework[i].subject,
                    "subtitle": doc.homeowrk[i].due
                }
            )
          }
          app.sendListTemplate(listItemsArray, id, function(result){
            console.log("List template sent")
          })
        })
      }
      cb(body.result.fulfillment.speech);
    }
  });
}
app.sendListTemplate = function(list, id, callback){
  var data = {
    "recipient":{
      "id":id
    }, "message": {
      "attachment": {
        "type": "template",
        "payload": {
            "template_type": "list",
            "top_element_style": "compact",
            "elements": list
          }
        }
      }
    }
  var reqObj = {
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: data
  };
  console.log(JSON.stringify(reqObj))
  request(reqObj, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', JSON.stringify(error));
      cb(false)
    } else if (response.body.error) {
      console.log("API Error: " + JSON.stringify(response.body.error));
      cb(false)
    } else{
      cb(true)
    }
  });
}
app.initUserHomework = function(data, db, callback) {
  // Get the documents collection
  var collection = db.collection('homework');
  // Insert some documents
  collection.insertOne(data, function(err, result) {
    if(err) throw err;
    callback(result);
  });
}
app.findDocument = function(sessionID, db, callback) {
  // Get the documents collection
  var collection = db.collection('homework');
  // Find some documents
  collection.findOne({'session': sessionID}, function(err, doc) {
    if(err){ throw err; }
    callback(doc);
  });
}
app.updateHomework = function(data, sessionID, db, callback) {
  // Get the documents collection
  var collection = db.collection('homework');
  // Update document where a is 2, set b equal to 1
  collection.updateOne({ session : sessionID }
    , { $push: { homework : data} }, function(err, result) {
      if(err){ throw err;}
      callback(result);
  });
}


// verify token to subscribe
app.get('/fb', function(req, res) {
  if (req.query['hub.verify_token'] === 'abc') {
     res.send(req.query['hub.challenge']);
   } else {
     res.send('Error, wrong validation token');
   }
});

// create a health check endpoint
app.get('/health', function(req, res) {
  res.send('okay');
});

// set port
app.set('port', process.env.PORT || 443);

// start the server
https.createServer(sslOpts, app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
