exports.handler = async (event, context) => {
    if (event.httpMethod === 'POST') {
        const { status } = JSON.parse(event.body);

        if (status !== 'Pants' && status !== 'Shorts') {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid status' }),
            };
        }

        process.env.STATUS = status;  // Store the status in an environment variable
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Status updated successfully!' }),
        };
    }

    return {
        statusCode: 405,
        body: 'Method Not Allowed',
    };
};
