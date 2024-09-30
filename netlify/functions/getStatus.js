const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
    const filePath = path.join(__dirname, '..', 'status.json');
    
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const jsonData = JSON.parse(data);
        return {
            statusCode: 200,
            body: JSON.stringify(jsonData),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch status' }),
        };
    }
};

