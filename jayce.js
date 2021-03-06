/**
 * Simple modern template engine.
 *
 * Boom.Lee <boom11235.gg@gmail.com>
 */
(function (root, factory) {
  /**
   * Simple Adapter to CMD, AMD, global
   */
  if (typeof define === 'function') {
    define(factory)
  } else if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory()
  } else {
    root.jayce = factory()
  }
})(this, function () {

  var _cache = {} // Render function cache.
  var _filters = {} // Filters.
  var _helpers = {} // Helpers, including `forEach` and so on.
  
  /**
   * Traverse each element in array.
   *
   * @param {Array} array Which will be traversed.
   * @param {Function} callback Do with each element.
   * @returns {String} Source array.
   */
  function forEach(array, callback) {
    var i = 0, len = array.length
    if (len) {
      while(i < len) {
        callback(array[i], i++)
      }
    } else {
      for (var item in array) {
        callback(array[item], item)
      }
    }
    
    return array
  }
  _helpers.forEach = forEach
  
  /**
   * Remove all space.
   *
   * @param {String} str
   * @returns {String} String without space.
   */
  function trimAll(str) {
    return str.replace(/\s/g, '')
  }
  
  /**
   * Transferred `", \, \r, \n`.
   *
   * @param {String} code Template code.
   * @returns {String} code
   */
  function stringify(code) {
    return String(code).replace(/("|\\)/g, '\\$1')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
  }

  /**
   * Basic Html Entities encode.
   * Reference: https://github.com/aui/artTemplate/blob/master/src/utils.js
   *
   * @param {String} code Html string.
   * @returns {String} Html string encoded.
   */
  var _escapeMap = {
    '<': '&#60;',
    '>': '&#62;',
    '"': '&#34;',
    "'": '&#39;',
    '&': '&#38;'
  }
  function _escapeFn(str) {
    return _escapeMap[str]
  }
  function _escapeHTML(html) {
    return String(html).replace(/&(?![\w#]+;)|[<>"']/g, _escapeFn)
  }
  _helpers.escape = _escapeHTML
  
  /**
   * Different template logic type support and pick variables.
   *
   * @param item
   * @param vars
   * @returns
   */
  var RE_VAR = /\.?(?!\d)[\d\w_$]+/g // To get variable name from the expression.
  var RE_END = /(?:\/\?|:\?|\/@)/ // To filter end.
  function typeParse(codes, records) {
    var vars = records.vars
    var if_m = records.if_m
    var each_m = records.each_m
    
    /**
     * Output string join. Using `_out` as variable.
     *
     * @param {String} code
     * @returns {String}
     */
    function _join(exp) {
      return '_out+=' + exp + ';'
    }
    
    /**
     * `While` code join to traverse.
     *
     * @param {String} exp Expression in template.
     * @returns {String} Final code.
     */
    function _traverse(exp) {
      var arr = exp.split(',')
      var target = arr[0]
      vars.push(target)
      var elem = arr[1]
      var index = arr[2]
      return '_$.forEach(' + target + ', function(' + elem + (index ? ',' + index : '') + '){'
    }
    
    /**
     * Parse `{v | f1 | f2}` to `_$$.f2(_$$.f1(v))`
     *
     * @param {String} exp
     * @param {Array} vars To save variable name.
     * @returns {String} Expression wrapped with filters.
     */
    function _filter(exp) {
      var exps = exp.split(/\|+/)
      var code
      forEach(exps, function (exp, index) {
        if (index === 0) {
          code = exp
          vars.push(exp.split('.')[0])
        } else {
          code = '_$$.' + exp + '(' + code + ')'
        }
      })
      return code
    }
    
    if (codes.length === 3) {
      var code = ''
      var exp = trimAll(codes[0])
      var sign = codes[1]
      var str = codes[2]
      
      if ((exp === '' || exp === '#') && !RE_END.test(sign)) {
        return _join('"{' + codes[0] + sign + '}' + str + '"')
      }
      
      switch (sign) {
        case '$':
          // Normal variables.
          if (exp.charAt(0) === '#') {
            // No escape.
            exp = exp.substr(1)
          } else {
            code = _join('_$.escape(' + _filter(exp) + ')')
          }
          break
        case '?':
          // Condition.
          records.if_m = if_m + 1
          forEach(exp.match(RE_VAR), function (item) {
            // When `obj.key`, `key` not a variable.
            if (!/\./.test(item)) {
              vars.push(item)
            }
          })
          code = 'if(' + exp + '){'
          break
        case ':?':
          if (if_m === 0) {
            return _join('"{' + codes[0] + sign + '}' + str + '"')
          }
          // Else.
          code = exp ? '}else if(' + exp +'){' : '}else{'
          break
        case '/?':
          if (if_m === 0) {
            return _join('"{' + codes[0] + sign + '}' + str + '"')
          }
          records.if_m = if_m - 1
          code = '}'
          break
        case '@':
          // Traverse.
          records.each_m = each_m + 1
          code = _traverse(exp)
          break
        case '/@':
          if (each_m === 0) {
            return _join('"{' + codes[0] + sign + '}' + str + '"')
          }
          records.each_m = each_m - 1
          code = '});'
          break
        default:
      }
      code += _join('"' + str + '"')
      return code
    }
    return _join('"' + codes[0] + '"')
  }
  
  /**
   * Wrap function to inject escape function and filters.
   *
   * @param {Function} fn Render function.
   * @returns {Function} Render to users.
   */
  function Wrap(fn) {
    return function (data) {
      return fn(data, _helpers, _filters)
    }
  }
  /**
   * Compile template string to render function.
   *
   * @param {String} tmpl Template string.
   * @returns {Function} render function.
   */
  var RE_LEFT = /\{/g
  var RE_RIGHT = /((?:\/|:)?[$?!@-])\}/g
  function compile(tmpl) {
    
    // Cache First.
    if (_cache[tmpl]) {
      return _cache[tmpl]
    }
    
    // Parse template syntax and pick up variables in template.
    tmpl = stringify(tmpl)
    var code = ''
    var records = {
      vars: [],
      if_m: 0,
      each_m: 0
    }
    forEach(tmpl.split(RE_LEFT), function (codes) {
      codes = codes.split(RE_RIGHT)
      code += typeParse(codes, records)
    })
    
    // Variables assignment.
    var header = 'var _out="";data=data||{};'
    forEach(records.vars, function (item) {
      header += 'var ' + item + '=data.' + item + ';'
    })
    code = header + code + 'return _out;'
    
    // Create render function and write cache.
    // `_$` as helpers, `_$$` as filters.
    var render = new Function('data', '_$', '_$$', code)
    return (_cache[tmpl] = Wrap(render))
  }
  
  /**
   * Description of what this does.
   *
   * @param
   * @returns
   */
  function render(tmpl, data) {
    return compile(tmpl)(data)
  }
  
  /**
   * Register a filter function.
   *
   * @param {String} name Filter name.
   * @param {Function} fn Filter function to call.
   * @returns {Object} Jayce Object.
   */
  function filter(name, fn) {
    _filters[name] = fn
    return this
  }
  
  return {
    compile: compile,
    render: render,
    filter: filter
  }
})
