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
 * @typedef {Object} SetStatusBody
 * @property {'Pants' | 'Shorts'} status
 */

/**
 * POST / — Updates the pants/shorts status.
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

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    // Parse and validate input
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
    }

    const { status } = body;
    if (!status) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing required field: status' }),
        };
    }

    try {
        const result = await db.updateStatus(status);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify(result),
        };
    } catch (error) {
        // Validation errors → 400, everything else → 500
        const isValidation = error.message.startsWith('Invalid status');
        console.error('Error in setStatus:', error.message);
        return {
            statusCode: isValidation ? 400 : 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};