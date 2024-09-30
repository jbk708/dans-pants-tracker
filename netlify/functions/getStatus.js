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
        const lastStatusDate = data.fields.LastStatusDate;
        let consecutiveDays = data.fields.ConsecutiveDays || 0;

        // Automatically check if it's a new day
        const daysDifference = calculateDaysDifference(lastStatusDate);
        if (daysDifference > 0) {
            consecutiveDays += daysDifference;  // Increment by how many days have passed

            // Update Airtable with the new consecutive days count
            const today = new Date().toISOString().split('T')[0];
            await fetch(airtableUrl, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${airtableToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: {
                        LastStatusDate: today,
                        ConsecutiveDays: consecutiveDays
                    }
                })
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ status, consecutiveDays }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch status' }),
        };
    }
};
