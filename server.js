'use strict';

const express = require('express'),
  Primus = require('primus'),
  Rooms = require('primus-rooms'),
  app = express(),
  server = require('http').createServer(app),
  primus = new Primus(server, { parser: 'JSON', transformer: 'websockets' }),
  log = require('npmlog'),
  zmq = require('zmq'),
  async = require('async');

log.level = process.env.LOGGING_LEVEL || 'verbose';

app.use(express.static(__dirname + '/'));

const port = process.env.PORT || 5000;

server.listen(port, function(){
  log.info('Primus server (' + process.pid + ') is listening on ', port);
});

primus.library();  
primus.save(__dirname +'/primus.js');
primus.use('rooms', Rooms);

/**
 * Infrastructure settings and data models
 */
const fetcherAddress = process.env.FETCHER_ADDRESS;
var resourceData = {}; // key = resourceId, value = data
var resourceObservers = {}; // key = resourceId, value = [connection1, conn2, ..]

/**
 * Public Endpoints
 */

primus.on('connection', function (spark) {
  handleClientConnected(spark);
})

function handleClientConnected(clientConnection) {
  if (!isValidConnection(clientConnection)) {
    clientConnection.end();
  }

  var resourceId = getResourceId(clientConnection);
  clientConnection.join(resourceId, null);

  var existingResourceData = resourceData[resourceId];

  if (existingResourceData) {
    sendResourceDataToObserver(clientConnection, existingResourceData);
  } else {
    requestResource(resourceId);
  }
}

// Publish a resource request for a resrouce that we don't have in memory (ie. in resourceData)
const resourceRequiredPusher = zmq.socket('push').bind('tcp://*:5432');
// Receive new resource data
const resourceUpdatedPuller = zmq.socket('pull').connect('tcp://localhost:5433');

resourceUpdatedPuller.on('message', function (data) {
  handleResourceDataReceived(data);
});

function handleResourceDataReceived(data) {
  var resource = JSON.parse(data); 
  log.verbose('Received resource data for resource ' + resource.id);

  storeResourceData(resource);

  notifyObservers(resource.id);
}

/**
 * Implementation of public endpoints
 */

function sendResourceDataToObserver(clientConnection, resourceData) {
  clientConnection.write(resourceData);
}

function requestResource(resourceId) {
  log.verbose('Requested resource (id: ' + resourceId + ') does not exist, sending a resource request');

  resourceRequiredPusher.send(JSON.stringify({id: resourceId}));
}

function storeResourceData(resource) {
  resourceData[resource.id] = resource.data;

  logAllResources();
}

function notifyObservers(resourceId) {
  var data = resourceData[resourceId];

  primus.room(resourceId).write(data);
}

function getResourceId(clientConnection) {
  // Sock.JS doesn't support this
  return clientConnection.query.resourceId;
}

function isValidConnection(clientConnection) {
  var resourceId = getResourceId(clientConnection);

  if (!resourceId) {
    log.warn('Bad resource id (' + resourceId + ') is requested, closing the socket connection');
    return false;
  }

  return true;
}

/**
 * Monitoring
 */
//  memwatch.on('leak', function(info) {
//   log.error('Possible memory leak: (ignore this when load testing)');
//   log.error(JSON.stringify(info, null, 2));
//   // process.exit(1);
// });

// memwatch.on('stats', function(stats) {
//   log.warn('GC usage trend:', stats.usage_trend);
// });

function closeAllConnections() {
  resourceRequiredPusher.close();
  resourceUpdatedPuller.close(); 
  primus.end();
}

process.on('uncaughtException', function (err) {
  log.error('Caught exception: ' + err.stack);    
  closeAllConnections();
  process.exit(1);
}); 

process.on('SIGINT', function() {
  closeAllConnections();
  process.exit();
});

/**
 * Logging
 */

function logNewObserver(clientConnection, resourceId) {
  log.info('New connection for ' + resourceId + '. This resource\'s observers: ' + 
    resourceObservers[resourceId].length + ', Total observers : ', primus.connected);
}

function logRemovedObserver() {
  log.verbose('Connection closed. Total connections: ', primus.connected);
  logResourceObservers();
}

function logResourceObservers() {
  for (var resourceId in resourceObservers) {
    if (resourceObservers.hasOwnProperty(resourceId)) {
      log.verbose(resourceObservers[resourceId].length + ' observers are watching ' + resourceId );
    }
  }
}

function logAllResources() {
  log.silly('Total resources in memory: ' + Object.keys(resourceData).length);
  // log.silly(JSON.stringify(resourceData, null, 4));
}