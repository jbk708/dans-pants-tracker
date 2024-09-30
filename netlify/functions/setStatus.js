const fetch = require('node-fetch');

// Helper function to calculate the difference in days between two dates
function calculateDaysDifference(startDate) {
    const today = new Date();
    const start = new Date(startDate);
    const differenceInTime = today.getTime() - start.getTime();
    const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
    return differenceInDays;
}

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
            const recordResponse = await fetch(airtableUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${airtableToken}` }
            });

            if (!recordResponse.ok) {
                throw new Error('Failed to fetch status from Airtable');
            }

            const recordData = await recordResponse.json();
            const currentStatus = recordData.fields.Status;
            const lastStatusDate = recordData.fields.LastStatusDate;
            const consecutiveDays = recordData.fields.ConsecutiveDays || 0;

            // If the status hasn't changed, update the days counter
            let newConsecutiveDays = consecutiveDays;
            let today = new Date().toISOString().split('T')[0];  // Get today's date in YYYY-MM-DD format

            if (status === currentStatus) {
                // If it's the same status, calculate how many days since the last status date
                newConsecutiveDays = calculateDaysDifference(lastStatusDate) + 1;
            } else {
                // If it's a different status, reset the counter
                newConsecutiveDays = 1;
            }

            // Update Airtable with the new status, last update date, and consecutive days
            const updateResponse = await fetch(airtableUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${airtableToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: {
                        Status: status,
                        LastStatusDate: today,
                        ConsecutiveDays: newConsecutiveDays
                    }
                })
            });

            if (!updateResponse.ok) {
                throw new Error('Failed to update status in Airtable');
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ message: `Status updated to: ${status}` }),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to update status' }),
            };
        }
    }

    return {
        statusCode: 405,
        body: 'Method Not Allowed',
    };
};
