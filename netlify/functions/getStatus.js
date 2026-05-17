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
 * GET / — Returns the current pants/shorts status and streak count.
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
        // refreshStreak handles day-rollover: bumps consecutive_days if it's a new day
        const result = await db.refreshStreak();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify(result),
        };
    } catch (error) {
        console.error('Error in getStatus:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch status' }),
        };
    }
};