RazorpayServices.RazorpayOrderResponse response =
    RazorpayServices.createOrder(
        500,
        'BATTERY-001'
    );

System.debug('========== RAZORPAY TEST ==========');
System.debug('Order ID: ' + response.id);
System.debug('Amount: ' + response.amount);
System.debug('Status: ' + response.status);
System.debug('===================================');