// value.js — Query historic data points via service discovery
//
// Usage: node value.js [host:port]
// Default connects to 127.0.0.1:7689

var studio = require('../../index.js');

var address = process.argv[2] || '127.0.0.1:7689';
var client = new studio.api.Client(address);

client.logger().then(function(logger) {
  return logger.requestLoggedNodes().then(function(nodes) {
    console.log('Logged nodes:');
    nodes.forEach(function(node) {
      console.log('  ' + node.name + ' (' + node.routing + ')');
      if (node.tags) {
        Object.keys(node.tags).forEach(function(key) {
          console.log('    ' + key + ': ' + node.tags[key].value);
        });
      }
    });
    return logger.requestLogLimits();
  }).then(function(limits) {
    console.log('\nLog range: ' + new Date(limits.startS * 1000).toISOString() +
                ' to ' + new Date(limits.endS * 1000).toISOString());
    var nodeName = 'CPULoad';
    return logger.requestDataPoints([nodeName], limits.startS, limits.endS, 10, 0)
      .then(function(points) {
        console.log('\n' + nodeName + ' (' + points.length + ' points):');
        points.forEach(function(p) {
          var v = p.value[nodeName];
          console.log('  ' + new Date(p.timestamp * 1000).toISOString() +
                      '  min=' + v.min.toFixed(4) + '  max=' + v.max.toFixed(4) +
                      '  last=' + v.last.toFixed(4));
        });
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
