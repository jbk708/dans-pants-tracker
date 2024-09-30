const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
    if (event.httpMethod === 'POST') {
        const { status } = JSON.parse(event.body);

        if (status !== 'Pants' && status !== 'Shorts') {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid status' }),
            };
        }

        const filePath = path.join(__dirname, 'status.json');
        const data = JSON.stringify({ status }, null, 2);

        try {
            fs.writeFileSync(filePath, data, 'utf-8');
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Status updated successfully!' }),
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

