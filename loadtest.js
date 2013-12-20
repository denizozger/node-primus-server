var log = require('npmlog');
var argh = require('argh').argv
  , Primus = require('primus')
  , Socket;

Socket = Primus.createSocket({
  transformer: argh.transformer,
  parser: argh.parser
});

log.level = 'verbose';

var sockets = [];
var maxSockets = 135;
var connectionAttempts = 0;

function connectToWebSocket() {
  connectionAttempts++;

  log.info('Connection attempt ' + connectionAttempts);

  var socket = new Socket('http://localhost:5000/?resourceId=matchesfeed/1/matchcentre');

  socket.on('data', function incoming(data) {
    // log.silly('data', 'Received data', 'string' === typeof data ? data : '<pre><code>'+ JSON.stringify(data, null, 2) +'</code></pre>');
  });

  socket.on('reconnect', function reconnect(opts) {
    log.warn('reconnect', 'Reconnecting', 'We are scheduling a new reconnect attempt. This is attempt '+ opts.attempt +' and will trigger a reconnect operation in '+ opts.timeout +' ms.');
  });

  socket.on('reconnect', function reconnect() {
    log.warn('reconnect', 'Reconnect', 'Starting the reconnect attempt, hopefully we get a connection!');
  });

  socket.on('online', function online() {
    log.info('network', 'Online', 'We have regained control over our internet connection.');
  });

  socket.on('offline', function offline() {
    log.warn('network', 'Offline', 'We lost our internet connection.');
  });

  socket.on('open', function open() {
    log.info('open', 'Open', Date() + ' The connection has been established.');
  });

  socket.on('error', function error(err) {
    log.error('error', 'Erorr', 'An unknown error has occured <code>'+ err.message +'</code>');
  });

  socket.on('end', function end() {
    log.warn('end', 'End', 'The connection has ended.');
  });

  socket.on('close', function close() {
    log.warn('close', 'close', 'We\'ve lost the connection to the server.');
  });

  sockets.push(socket);

  if (connectionAttempts < maxSockets) {
    setTimeout(connectToWebSocket, 500);
  } 
};

connectToWebSocket();
