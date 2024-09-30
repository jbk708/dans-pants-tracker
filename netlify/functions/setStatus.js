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
            // First, get the current record from Airtable
            const recordResponse = await fetch(airtableUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${airtableToken}` }
            });

            if (!recordResponse.ok) {
                throw new Error(`Failed to fetch status from Airtable: ${recordResponse.statusText}`);
            }

            const recordData = await recordResponse.json();
            const currentStatus = recordData.fields.Status;
            const lastStatusDate = recordData.fields.LastStatusDate;
            const consecutiveDays = recordData.fields.ConsecutiveDays || 0;

            let newConsecutiveDays = consecutiveDays;
            const today = new Date().toISOString().split('T')[0];  // Get today's date in YYYY-MM-DD format

            if (status === currentStatus) {
                newConsecutiveDays = calculateDaysDifference(lastStatusDate) + 1;
            } else {
                newConsecutiveDays = 1;
            }

            // Update Airtable with the new status and consecutive days
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
                const errorData = await updateResponse.json();
                throw new Error(`Failed to update Airtable: ${updateResponse.statusText}. Error details: ${JSON.stringify(errorData)}`);
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ message: `Status updated to: ${status}` }),
            };
        } catch (error) {
            console.error('Error updating status:', error.message);
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

