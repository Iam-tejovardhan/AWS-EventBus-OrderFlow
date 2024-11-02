import AWS from 'aws-sdk';
import logger from "./logger.mjs";

const dynamoDb = new AWS.DynamoDB.DocumentClient();

export const lambdaHandler = async (event, context) => {
    try {
        const orderDetails = event.detail;
        const detailType = event['detail-type'];
        const { orderId, items, status } = orderDetails; 
        logger.info("Processing event for order:", { orderId, detailType });

        // Step 1: Handle OrderPlaced - Insert data in Orders table and update Inventory
        if (detailType === "OrderPlaced") {
            // Insert order into Orders table
            const putOrderParams = {
                TableName: process.env.ORDERS_TABLE,
                Item: {
                    OrderId: orderId,
                    Status: "Placed",
                    ...orderDetails,
                },
            };
            await dynamoDb.put(putOrderParams).promise();
            logger.info(`Order ${orderId} stored successfully in Orders table.`);

            // Update Inventory table for each item
            for (const item of items) {
                const { productId, quantity } = item;

                const updateInventoryParams = {
                    TableName: process.env.INVENTORY_TABLE,
                    Key: { ProductId: productId },
                    UpdateExpression: "SET Quantity = Quantity - :quantity",
                    ExpressionAttributeValues: { ":quantity": quantity },
                    ConditionExpression: "Quantity >= :quantity",
                    ReturnValues: "UPDATED_NEW",
                };

                try {
                    const updateResult = await dynamoDb.update(updateInventoryParams).promise();
                    logger.info(`Inventory updated for ProductId ${productId}:`, updateResult);
                } catch (inventoryError) {
                    logger.error(`Failed to update inventory for ProductId ${productId}`, { error: inventoryError });
                    throw new Error(`Insufficient inventory for ProductId ${productId}`);
                }
            }
        }

        // Step 2: Handle OrderShipped or OrderDelivered - Update Order Status
        else if (detailType === "OrderShipped" || detailType === "OrderDelivered") {
            const updateOrderStatusParams = {
                TableName: process.env.ORDERS_TABLE,
                Key: { OrderId: orderId },
                UpdateExpression: "SET Status = :status",
                ExpressionAttributeValues: { ":status": status || detailType },
                ReturnValues: "UPDATED_NEW",
            };
            await dynamoDb.update(updateOrderStatusParams).promise();
            logger.info(`Order ${orderId} status updated to ${status || detailType}`);
        }

        // Step 3: Handle OrderCanceled - Update Inventory and Order Status
        else if (detailType === "OrderCanceled") {
            // Update Order Status to "Canceled"
            const updateOrderStatusParams = {
                TableName: process.env.ORDERS_TABLE,
                Key: { OrderId: orderId },
                UpdateExpression: "SET Status = :status",
                ExpressionAttributeValues: { ":status": "Canceled" },
                ReturnValues: "UPDATED_NEW",
            };
            await dynamoDb.update(updateOrderStatusParams).promise();
            logger.info(`Order ${orderId} status updated to Canceled`);

            // Restore inventory for each item in the canceled order
            for (const item of items) {
                const { productId, quantity } = item;

                const updateInventoryParams = {
                    TableName: process.env.INVENTORY_TABLE,
                    Key: { ProductId: productId },
                    UpdateExpression: "SET Quantity = Quantity + :quantity",
                    ExpressionAttributeValues: { ":quantity": quantity },
                    ReturnValues: "UPDATED_NEW",
                };

                await dynamoDb.update(updateInventoryParams).promise();
                logger.info(`Inventory restored for ProductId ${productId} by ${quantity}`);
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Processed ${detailType} event successfully` }),
        };
    } catch (error) {
        logger.error("Error processing event", { error });
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Failed to process event" }),
        };
    }
};