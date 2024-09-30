exports.handler = async (event, context) => {
    const status = process.env.STATUS || 'unknown';  // Retrieve the status from the environment variable
    
    return {
        statusCode: 200,
        body: JSON.stringify({ status }),
    };
};
