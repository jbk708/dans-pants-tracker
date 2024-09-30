const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const airtableUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Status/${process.env.AIRTABLE_RECORD_ID}`;
    const airtableToken = process.env.AIRTABLE_ACCESS_TOKEN;

    try {
        const response = await fetch(airtableUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${airtableToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch status from Airtable');
        }

        const data = await response.json();
        const status = data.fields.Status || 'unknown';

        return {
            statusCode: 200,
            body: JSON.stringify({ status }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
