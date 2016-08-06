'use strict';

var chai = require('chai');
var QueryParser = require('.');

describe('QueryParser', () => {
    describe('#constructor', () => {
        it('should normally be constructed with any non-empty query', () => {
            chai.expect(() => {new QueryParser('invalid query')}).to.not.throw();
        });

        it('should throw an exception if query string is null or empty', () => {
            chai.expect(() => {new QueryParser()}).to.throw();
        });
    });

    describe('#query', () => {

        function getQuery(queryStr) {
            var parser = new QueryParser(queryStr);
            var query = parser.query;
            // console.log(JSON.stringify(query, null, 2));
            return query;
        }

        function expectThrow(queryStr) {
            chai.expect(() => getQuery(queryStr)).to.throw();
        }

        function expectNotThrow(queryStr) {
            chai.expect(() => getQuery(queryStr)).to.not.throw();
        }

        it('should throw an exception if query string is totally invalid', () => {
            expectThrow('invalid query');
        });

        it('should throw an exception if query has unknown directive', () => {
            expectThrow('select(a, b, c), remove(d, e, f)');
        });

        it('should throw an exception if query has invalid arguments in "select" directive', () => {
            expectThrow('select(null)');
            expectThrow('select(0)');
            expectThrow('select(true)');
            expectThrow('select([])');
            expectThrow('select(a, b, 0)');
            expectThrow('select(a, b, true)');
            expectThrow('select(totally invalid sequence))');
            expectNotThrow('select("0", "true", "null")');
        });

        it('should throw an exception if query has invalid arguments in "where" directive', () => {
            expectThrow('where(a == --1)');
            expectThrow('where(a === 1)');
            expectThrow('where(a && b)');
            expectThrow('where(a || false)');
            expectThrow('where(totally invalid sequence))');
            expectThrow('where(a in [1, 2, 3, []])');
        });

        it('should throw an exception if query has invalid arguments in "extend" directive', () => {
            expectThrow('extend(null)');
            expectThrow('extend(0)');
            expectThrow('extend(true)');
            expectThrow('extend([])');
            expectThrow('extend(a, b, 0)');
            expectThrow('extend(a, b, true)');
            expectThrow('extend(totally invalid sequence))');
            expectNotThrow('extend("0", "true", "null")');
        });

        it('should throw an exception if query has invalid arguments in "order" directive', () => {
            expectThrow('order(null)');
            expectThrow('order(false)');
            expectThrow('order(0)');
            expectThrow('order(!a)');
            expectNotThrow('extend("null", "false", "0")');
        });

        it('should throw an exception if query has invalid arguments in "limit" directive', () => {
            expectThrow('limit(null)');
            expectThrow('limit(true)');
            expectThrow('limit(a)');
            expectThrow('limit("a")');
            expectThrow('limit([])');
            expectThrow('limit(-1)');
            expectThrow('limit(1, 2)');
            expectNotThrow('limit(1)');
        });

        it('should throw an exception if query has invalid arguments in "offset" directive', () => {
            expectThrow('offset(null)');
            expectThrow('offset(true)');
            expectThrow('offset(a)');
            expectThrow('offset("a")');
            expectThrow('offset([])');
            expectThrow('offset(-1)');
            expectThrow('offset(1, 2)');
            expectNotThrow('offset(1)');
        });

        var query =
            'select("a.b.c", "d", e, "f.pro-per_ty"), ' +
            'where("a.b.c" != "str" && ((((d == -1)))) || null == null && e == false && !("f.pro-per_ty" in [1, 2, 3, "4", false, true, -1, "", null])), ' +
            'order("a.b.c", -"d", -e, +"f.pro-per_ty", -"f.a.d"), ' +
            'extend(a, b, "c.d.e", "null"), ' +
            'limit(100), ' +
            'offset(200)';

        it('should contains right values for "select" directive', () => {
            chai.expect(getQuery(query).select).to.deep.equal(["a.b.c", "d", "e", "f.pro-per_ty"]);
        });

        it('should contains right values for "where" directive', () => {
            var rightWhere = {
                "$or": [
                    {
                        "$and": [
                            {
                                "a.b.c": {
                                    "$ne": "str"
                                }
                            },
                            {
                                "d": {
                                    "$eq": -1
                                }
                            }
                        ]
                    },
                    {
                        "$and": [
                            {
                                "null": {
                                    "$eq": null
                                }
                            },
                            {
                                "e": {
                                    "$eq": false
                                }
                            },
                            {
                                "f.pro-per_ty": {
                                    "$nin": [
                                        1,
                                        2,
                                        3,
                                        "4",
                                        false,
                                        true,
                                        -1,
                                        "",
                                        null
                                    ]
                                }
                            }
                        ]
                    }
                ]
            };
            var rightWhereFields = [
                "a.b.c",
                "d",
                "null",
                "e",
                "f.pro-per_ty"
            ];
            chai.expect(getQuery(query).where).to.deep.equal(rightWhere);
            chai.expect(getQuery(query).whereFields).to.deep.equal(rightWhereFields);
        });

        it('should contains right values for "extend" directive', () => {
            var rightExtend = ["a", "b", "c.d.e", "null"];
            chai.expect(getQuery(query).extend).to.deep.equal(rightExtend);
        });

        it('should contains right values for "order" directive', () => {
            var rightOrder = [
                {
                    "a.b.c": 1
                },
                {
                    "d": -1
                },
                {
                    "e": -1
                },
                {
                    "f.pro-per_ty": 1
                },
                {
                    "f.a.d": -1
                }
            ];
            chai.expect(getQuery(query).order).to.deep.equal(rightOrder);
        });

        it('should contains right values for "limit" directive', () => {
            chai.expect(getQuery(query).limit).to.equal(100);
        });

        it('should contains right values for "offset" directive', () => {
            chai.expect(getQuery(query).offset).to.equal(200);
        });
    });

});
