const { ModelError, UnknownFilterError } = require('./errors')
const filters = require('./filters')
const getters = require('./getters')
const { parseQuery } = require('./query-parser')
const {
  has, isArray, isObject, isString,
} = require('./utils')

/**
 * Given a `dom`, traverse it to get the desired item
 * @static
 * @private
 * @param  {Object} dom DOM node
 * @param  {(string|Array|Object)} item Data to extract
 * @return {string} A string or an array of strings with the extracted data
 */

function extractItem(dom, item, selectEngine) {
  if (isArray(item)) {
    const queryAST = parseQuery(item[0])
    const matches = selectEngine.selectAll(queryAST.selector, dom)

    if (!matches || !matches.length) return null

    if (isArray(item[1]) || isObject(item[1])) {
      return matches.map((context) => extractItem(context, item[1], selectEngine))
    }

    return matches.map((node) => {
      const data = resolveGetter(getters, queryAST)(node)
      return applyFilters(filters, queryAST, data)
    })
  }

  if (isObject(item)) {
    return Object.keys(item).reduce((acc, key) => {
      acc[key] = extractItem(dom, item[key], selectEngine)
      return acc
    }, {})
  }

  if (isString(item)) {
    const query = parseQuery(item)
    const match = selectEngine.selectOne(query.selector, dom)

    if (!match) return null

    const data = resolveGetter(getters, query)(match)

    return applyFilters(filters, query, data)
  }

  const unsupportedType = item === null ? 'null' : typeof item
  throw new ModelError(
    `The model has to be a string, an Object or an Array; got ${unsupportedType} instead.`
  )
}

/**
 * Given a getters collection and a query, decide what getter function to use
 * @static
 * @private
 * @param  {Object} collection Simple collection of getter functions
 * @param  {Object} query Query object, containing a getter property
 * @return {Function} A getter function
 */

function resolveGetter(collection, query) {
  // Default to $text / $textContent if no getter was provided in query
  if (query.getter === null) return collection.$textContent

  // Use requested getter function if it is part of the getters collection
  if (has(collection, query.getter)) return collection[query.getter]

  // Simply return node attribute if a getter was requested in query
  // but doesn't exist in the getters collection
  return (el) => el.attribs[query.getter] || null
}

/**
 * Given a filters collection, a query object, and data to process, apply all
 * requested filters by query over the data
 * @static
 * @private
 * @param  {Object} collection Simple collection of filter functions
 * @param  {Object} query Query object, containing a filters array property
 * @param  {string} data Data to be transformed
 * @return {string} Data after all filters have been applied in order
 */

function applyFilters(collection, query, data) {
  // Apply each filter declared in the query, passing the result of the last as
  // the argument of the next
  return query.filters.reduce((result, filter) => {
    // Check if the requested filter exists in the filters collection
    if (has(collection, filter.name)) {
      // if so, call it
      return collection[filter.name].apply(null, [result, ...filter.args])
    }
    // if not, throw error
    throw new UnknownFilterError(`Filter ${filter.name} does not exist.`)
  }, data)
}

module.exports = {
  extractItem,
}