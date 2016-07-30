var QueryParser = require('.');

var query = 'select("a.name", b, c), where (!(("a.options.authors" == 1 && b == 2 && !(c == 0)))), extend ("a.name", b, "c.value.author"), order (+"a.authors", -b, c, -d), limit("6"), offset(5)';


var parser = new QueryParser(query);

console.log(JSON.stringify(parser.query, null, 2));

