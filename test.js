var QueryParser = require('.');

//var query = 'select("a.name", b, c), where (!(("a.options.authors" == 1 && b == 2 && !(c == 0)))), extend ("a.name", b, "c.value.author"), order (+"a.authors", -b, c, -d), limit("6"), offset(5)';


//var query = 'select(a, b, c), where(a == 0 || b == 0 || !(c == 0 || d == true))';

var query =
    'select("a.b.c", "d", e, "f.pro-per_ty"), ' +
    'where("a.b.c" != "str" && ((((d == -1)))) || null == null && e == false && !("f.pro-per_ty" in [1, 2, 3, "4", false, true, -1, "", null])), ' +
    'order("a.b.c", -"d", -e, +"f.pro-per_ty", -"f.a.d"), ' +
    'extend(a, b, "c.d.e", "null"), ' +
    'limit(100), ' +
    'offset(100)';

var parser = new QueryParser(query);

var query = parser.query;

console.log(JSON.stringify(query, null, 2));

