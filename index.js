'use strict';

var acorn = require('acorn');

class QueryParser {
    constructor(queryStr) {
        if (!queryStr)
            throw new Error('queryStr is required argument');
        this._operatorsMap = {
            '>': '$gt',
            '<': '$lt',
            '>=': '$gte',
            '<=': '$lte',
            '==': '$eq',
            '!=': '$ne',
            'in': '$in',
            'nin': '$nin',
            '&&': '$and',
            '||': '$or',
            '!': '$not',
            '!!': ''
        };
        this._operatorsInversionMap = {
            '>': '<=',
            '<': '>=',
            '>=': '<',
            '<=': '>',
            '==': '!=',
            '!=': '==',
            'in': 'nin',
            'nin': 'in',
            '!': '!!',
            '&&': '||',
            '||': '&&'
        };
        this._queryStr = queryStr;
    }

    get query() {
        if (!this._query)
            this._createAst();
        return this._query;
    }

    _createAst() {
        this._query = {};
        var tree = acorn.parse(this._queryStr);

        if (!tree.body || tree.body.length !== 1 || tree.body[0].type !== 'ExpressionStatement')
            throw new Error('Invalid expression');
        var expression = tree.body[0].expression;
        var expressions = null;
        if (expression.type == 'CallExpression') {
            expressions = [expression];
        } else if (expression.type == 'SequenceExpression') {
            expressions = expression.expressions;
        } else {
            throw new Error('Invalid expression');
        }
        expressions.forEach(e => {
            if (e.type !== 'CallExpression' || e.callee.type !== 'Identifier') {
                new Error('Invalid expression');
            }
            var callee = e.callee.name;
            switch (e.callee.name) {
                case 'select':
                    this._parseSelect(e.arguments);
                    break;
                case 'where':
                    this._parseWhere(e.arguments);
                    break;
                case 'order':
                    this._parseOrder(e.arguments);
                    break;
                case 'extend':
                    this._parseExtend(e.arguments);
                    break;
                case 'limit':
                    this._parseLimit(e.arguments);
                    break;
                case 'offset':
                    this._parseOffset(e.arguments);
                    break;
                default:
                    throw new Error(`Invalid directive: "${e.callee.name}"`);
            }
        });
    }

    _normalizeQuery(queryObject) {
        var normalized = false;
        Object.keys(queryObject).forEach(k => {
            if (k === '$or' || k === '$and') {
                var exprArray =  queryObject[k];
                var l = exprArray.length;
                var newArray = [];
                for (var i = 0; i < l; i++) {
                    var innerObj = exprArray[i];
                    var innerObjKeys = Object.keys(innerObj);
                    if (innerObjKeys.length === 1) {
                        if (innerObjKeys[0] === k) {
                            normalized = true;
                            newArray = newArray.concat(innerObj[k]);
                        } else {
                            while (this._normalizeQuery(innerObj)) {};
                            newArray.push(exprArray[i]);
                        }
                    } else {
                        newArray.push(exprArray[i]);
                    }
                }
                queryObject[k] = newArray;
            }
        });
        return normalized;
    }

    _parseSelect(args) {
        var select = [];
        args.forEach((a, i) => {
            var value = this._parseIdentifierValue(a);
            select.push(value);
        });
        this._query.select = select;
    }

    _parseWhere(args) {
        var where = [];
        var whereFields = {};
        this._parseWhereExpression(where, args, whereFields, false);
        if (where.length === 1) {
            this._query.where = where[0];
        } else {
            this._query.where = {
                $and: where
            };
        }
        while(this._normalizeQuery(this._query.where));
        this._query.whereFields = Object.keys(whereFields);
    }

    _parseWhereExpression(root, args, whereFields, inverse) {
        args.forEach((a) => {
            var obj = this._parseExpressionArg(a, whereFields, inverse);
            root.push(obj);
        });
    }

    _parseNegativeValue(a) {
        if (a.operator !== '-')
            throw new Error(`Syntax error at ${a.start}. Invalid unary operator ${a.operator}.`);
        if (a.argument.type !== 'Literal')
            throw new Error(`Syntax error at ${a.start}. Explicit value expected.`);
        return (-a.argument.value);
    }

    _parseIdentifierValue(a) {
        if (a.type !== 'Identifier' && a.type !== 'Literal')
            throw new Error(`Syntax error at: ${a.start}. Invalid select argument at index: ${i}. Identifier expected.`);
        var value = a.type === 'Identifier' ? a.name : a.value;
        if (typeof value !== 'string')
            throw new Error(`Syntax error at: ${a.start}. Invalid select argument at index: ${i}. Identifier expected.`);
        return value;
    }

    _parseExpressionArg(a, whereFields, inverse) {
        var obj = {};
        var operator = this._operatorsMap[!inverse ? a.operator : this._operatorsInversionMap[a.operator]];
        if (operator === undefined)
            throw new Error(`Syntax error at ${a.start}. Unknown operator: ${a.operator}.`);
        if ((operator == '$in' || operator == '$nin') && a.right.type !== 'ArrayExpression')
            throw new Error(`Syntax error at: ${a.right.start}. Array expected.`);
        if (a.type == 'UnaryExpression' && a.operator === '!') {
            obj = this._parseExpressionArg(a.argument, whereFields, inverse !== (a.operator === '!'));
        } else if (a.type == 'BinaryExpression') {
            if (a.left.type !== 'Identifier' && a.left.type !== 'Literal')
                throw new Error(`Syntax error at ${a.start}. Identifier expected.`);
            var name = a.left.type == 'Identifier' ? a.left.name : a.left.value;
            if (a.right.type !== 'Literal' && a.right.type !== 'UnaryExpression' && a.right.type !== 'ArrayExpression') {
                throw new Error(`Syntax error at ${a.start}. Explicit value expected.`);
            }
            var value = null;
            if (a.right.type === 'Literal') {
                value = a.right.value;
            } else if (a.right.type === 'UnaryExpression') {
                value = this._parseNegativeValue(a.right);
            } else {
                value = a.right.elements.map(e => {
                    if (e.type === 'UnaryExpression') {
                        return this._parseNegativeValue(e);
                    } else if (e.type === 'Literal') {
                        return e.value;
                    }
                    throw new Error(`Syntax error at ${e.start}. Invalid array element.`);
                });
            }
            obj[name] = {};
            obj[name][operator] = value;
            whereFields[name] = true;
        } else if (a.type == 'LogicalExpression') {
            var newRoot = [];
            obj[operator] = newRoot;
            this._parseWhereExpression(newRoot, [a.left, a.right], whereFields, inverse);
        } else {
            throw new Error(`Unknown expression at: ${a.start}.`);
        }
        return obj;

    }

    _parseExtend(args) {
        var extend = [];
        args.forEach((a, i) => {
            extend.push(this._parseIdentifierValue(a));
        });
        this._query.extend = extend;
    }

    _parseOrder(args) {
        var order = [];
        args.forEach((a, i) => {
            if (a.type !== 'Identifier' && a.type !== 'Literal' && a.type !== 'UnaryExpression')
                throw new Error(`Syntax error at: ${a.start}. Invalid order argument at index: ${i}. Identifier expected.`);
            if (a.type === 'UnaryExpression' && a.operator !== '+' && a.operator !== '-')
                throw new Error(`Syntax error at: ${a.start}. Invalid order argument at index: ${i}. Invalid operator: ${a.operator}.`);
            var name = a.type === 'Identifier' || a.type === 'Literal' ? a.name || a.value : a.argument.type === 'Identifier' ? a.argument.name : a.argument.value;
            if (typeof name !== 'string')
                throw new Error(`Syntax error at: ${a.start}. Invalid order argument at index: ${i}. Identifier expected.`);
            var asc = a.type === 'Identifier' || a.type === 'Literal' ? 1 : a.operator === '+' ? 1 : -1;
            var obj = {};
            obj[name] = asc;
            order.push(obj);
        });
        this._query.order = order;
    }

    _parseLimit(args) {
        if (args.length !== 1)
            throw new Error(`Invalid arguments count in the limit directive. Expected 1, got ${args.length}.`);
        var arg = args[0];
        if (arg.type !== 'Literal')
            throw new Error(`Invalid limit argument. Explicit value expected.`);
        var intVal = parseInt(arg.value);
        if (!(intVal >= 0))
            throw new Error(`Invalid limit argument. Integer value expected.`);
        this._query.limit = intVal;
    }

    _parseOffset(args) {
        if (args.length !== 1)
            throw new Error(`Invalid arguments count in the offset directive. Expected 1, got ${args.length}.`);
        var arg = args[0];
        if (arg.type !== 'Literal')
            throw new Error(`Invalid offset argument. Explicit value expected.`);
        var intVal = parseInt(arg.value);
        if (!(intVal >= 0))
            throw new Error(`Invalid offset argument. Integer value expected.`);
        this._query.offset = intVal;
    }


}

module.exports = QueryParser;