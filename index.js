'use strict'

var acorn = require('acorn');

module.exports = class QueryParser {
    constructor(queryStr) {
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
        }
        this._queryStr = queryStr;
        this.query = {};
        this._createAst();
    }

    _createAst() {
        var tree = acorn.parse(this._queryStr);
        console.log(JSON.stringify(tree, null, 2));

        if (!tree.body || tree.body.length !== 1 || tree.body[0].type !== 'ExpressionStatement')
            throw new Error('Invalid expression');
        var expression = tree.body[0].expression;
        if (expression.type == 'CallExpression') {
            var expressions = [expression];
        } else if (expression.type == 'SequenceExpression') {
            var expressions = expression.expressions;
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

    _parseSelect(args) {
        var select = [];
        args.forEach((a, i) => {
            if (a.type !== 'Identifier' && a.type !== 'Literal')
                throw new Error(`Syntax error at: ${a.start}. Invalid select argument at index: ${i}. Identifier expected.`);
            select.push(a.type === 'Identifier' ? a.name : a.value);
        });
        this.query.select = select;
    }

    _parseWhere(args) {
        var where = [];
        var whereFields = {};
        this._parseWhereExpression(where, args, whereFields, false);
        if (where.length === 1) {
            this.query.where = where[0];
        } else {
            this.query.where = {
                $and: where
            };
        }
        this.query.whereFields = Object.keys(whereFields);
    }

    _parseWhereExpression(root, args, whereFields, inverse) {
        args.forEach((a) => {
            var obj = this._parseExpressionArg(a, whereFields, inverse);
            root.push(obj);
        });
    }

    _parseExpressionArg(a, whereFields, inverse) {
        var obj = {};
        var operator = this._operatorsMap[!inverse ? a.operator : this._operatorsInversionMap[a.operator]];
        if (operator === undefined)
            throw new Error(`Syntax error at ${a.start}. Unknown operator: ${a.operator}.`);
        if ((operator == '$in' || operator == '$nin') && a.right.type !== 'ArrayExpression')
            throw new Error(`Syntax error at: ${a.right.start}. Array expected.`);
        // console.log('OPERATOR', inverse ? 'INVERSE' : 'NORMAL', a.operator, operator);
        if (a.type == 'UnaryExpression') {
            obj = this._parseExpressionArg(a.argument, whereFields, inverse !== (a.operator === '!'));
        } else if (a.type == 'BinaryExpression') {
            if (a.left.type !== 'Identifier' && a.left.type !== 'Literal')
                throw new Error(`Syntax error at ${a.start}. Identifier expected.`);
            var name = a.left.type == 'Identifier' ? a.left.name : a.left.value;
            if (a.right.type !== 'Literal' && a.right.type !== 'ArrayExpression')
                throw new Error(`Syntax error at ${a.start}. Explicit value expected.`);
            if (a.right.type === 'Literal') {
                var value = a.right.value;
            } else {
                var value = a.right.elements.map(e => e.value);
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
            if (a.type !== 'Identifier' && a.type !== 'Literal')
                throw new Error(`Syntax error at: ${a.start}. Invalid extend argument at index: ${i}. Identifier expected.`);
            extend.push(a.type === 'Identifier' ? a.name : a.value);
        });
        this.query.extend = extend;
    }

    _parseOrder(args) {
        var order = [];
        args.forEach((a, i) => {
            if (a.type !== 'Identifier' && a.type !== 'UnaryExpression')
                throw new Error(`Syntax error at: ${a.start}. Invalid order argument at index: ${i}. Identifier expected.`);
            if (a.type === 'UnaryExpression' && a.operator !== '+' && a.operator !== '-')
                throw new Error(`Syntax error at: ${a.start}. Invalid order argument at index: ${i}. Invalid operator: ${a.operator}.`);
            var name = a.type === 'Identifier' ? a.name : a.argument.type === 'Identifier' ? a.argument.name : a.argument.value;
            var asc = a.type === 'Identifier' ? 1 : a.operator === '+' ? 1 : -1;
            var obj = {};
            obj[name] = asc;
            order.push(obj);
        });
        this.query.order = order;
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
        this.query.limit = intVal;
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
        this.query.offset = intVal;
    }


}