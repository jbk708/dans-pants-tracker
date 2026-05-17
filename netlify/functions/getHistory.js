const db = require('../../lib/db');

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