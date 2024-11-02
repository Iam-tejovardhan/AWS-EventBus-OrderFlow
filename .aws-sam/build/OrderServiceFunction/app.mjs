import AWS from 'aws-sdk';
import logger from './logger.mjs'; 
const eventBridge = new AWS.EventBridge();
export const lambdaHandler  = async(event,context) =>{
    try {
        const orderData = JSON.parse(event.body);
        const detailType = orderData.detailType;

        logger.info("Received order and parsed order data",{orderData});
        const eventParams = {
            Entries: [
                {
                    Source: "ecommerce.order",
                    DetailType: detailType,
                    Detail: JSON.stringify(orderData),
                    EventBusName: "EcommerceEventBus",
                },
            ],
        };
        await eventBridge.putEvents(eventParams).promise();
        // Simulate processing the order
        const response = {
            statusCode: 200,
            body: JSON.stringify({ message: "Order processed successfully!" }),
        };
        logger.info("Returning response", { response });
        return response;

    } catch (error) {
        logger.info("Error processing order", { error });
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Failed to process order" }),
        };
    }
}