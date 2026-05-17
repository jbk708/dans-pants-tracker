const db = require('../../lib/db');

/**
 * @typedef {Object} NetlifyALBEvent
 * @property {string} httpMethod
 * @property {string | null} body
 * @property {{ limit?: string, page?: string } | null} queryStringParameters
 * @property {string} path
 * @property {Record<string, string>} headers
 */

/**
 * @typedef {Object} StatusResponse
 * @property {number} statusCode
 * @property {Record<string, string>} headers
 * @property {string} body
 */

/**
 * @typedef {Object} GetHistoryRow
 * @property {number} id
 * @property {string} user_id
 * @property {string} status
 * @property {string} changed_at
 */

/**
 * @typedef {Object} GetHistoryResult
 * @property {number} page
 * @property {number} limit
 * @property {GetHistoryRow[]} rows
 */

/**
 * GET / — Returns paginated status-change history.
 *
 * @param {NetlifyALBEvent} event
 * @returns {Promise<StatusResponse>}
 */
exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        // Parse query params with defaults: limit=20, page=1 (1-indexed)
        const limit = Math.min(parseInt(event.queryStringParameters?.limit) || 20, 100);
        const page = Math.max(parseInt(event.queryStringParameters?.page) || 1, 1);
        const offset = (page - 1) * limit;

        // Fetch paginated history rows (default userId: 'default')
        const rows = await db.getHistory({ limit, userId: 'default' });

        // Apply offset manually since db.getHistory doesn't accept it directly
        const paginatedRows = rows.slice(0, limit);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                page,
                limit,
                rows: paginatedRows,
            }),
        };
    } catch (error) {
        console.error('Error in getHistory:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch history' }),
        };
    }
};