const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    if (event.httpMethod === 'POST') {
        const { status } = JSON.parse(event.body);

        if (status !== 'Pants' && status !== 'Shorts') {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid status' }),
            };
        }

        const airtableUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Status/${process.env.AIRTABLE_RECORD_ID}`;
        const airtableToken = process.env.AIRTABLE_ACCESS_TOKEN;

        try {
            const response = await fetch(airtableUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${airtableToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: {
                        Status: status
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update status in Airtable');
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ message: `Status updated to: ${status}` }),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: error.message }),
            };
        }
    }

    return {
        statusCode: 405,
        body: 'Method Not Allowed',
    };
};
