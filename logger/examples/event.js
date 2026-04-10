// event.js — Query events via service discovery
//
// Usage: node event.js [host:port]
// Default connects to 127.0.0.1:7689

var studio = require('../../index.js');
var EventQueryFlags = studio.logger.Client.EventQueryFlags;

var address = process.argv[2] || '127.0.0.1:7689';
var client = new studio.api.Client(address);

client.logger().then(function(logger) {
  return logger.countEvents({}).then(function(count) {
    console.log('Total events: ' + count);
    return logger.requestEvents({
      limit: 20,
      flags: EventQueryFlags.NewestFirst
    });
  }).then(function(events) {
    console.log('\nLatest ' + events.length + ' events:\n');
    events.forEach(function(event) {
      var code = logger.getEventCodeString(event.code);
      console.log(new Date(event.timestampSec * 1000).toISOString() +
                  '  [' + (code || event.code) + ']  ' +
                  event.sender);
      if (event.data && event.data.Text) {
        console.log('    ' + event.data.Text);
      }
    });
  });
}).then(function() {
  client.close();
  process.exit(0);
}).catch(function(err) {
  console.error('Error:', err);
  client.close();
  process.exit(1);
});
