public with sharing class RazorpayServices {

    public class RazorpayOrderResponse {
        public String id;
        public String entity;
        public Integer amount;
        public String status;
    }

    public static RazorpayOrderResponse createOrder(
        Decimal amount,
        String receipt
    ) {

        HttpRequest req = new HttpRequest();

        req.setEndpoint('callout:Razorpay_API/orders');
        req.setMethod('POST');

        req.setHeader('Content-Type', 'application/json');

        Integer amountInPaise = Integer.valueOf(
            (amount * 100).setScale(0)
        );

        Map<String, Object> requestBody =
            new Map<String, Object>();

        requestBody.put('amount', amountInPaise);
        requestBody.put('currency', 'INR');
        requestBody.put('receipt', receipt);

        req.setBody(JSON.serialize(requestBody));

        Http http = new Http();

        HttpResponse res = http.send(req);

        System.debug('Razorpay Status: ' + res.getStatusCode());
        System.debug('Razorpay Response: ' + res.getBody());

        if (res.getStatusCode() >= 200 &&
            res.getStatusCode() < 300) {

            return (RazorpayOrderResponse) JSON.deserialize(
                res.getBody(),
                RazorpayOrderResponse.class
            );
        }

        throw new CalloutException(
            'Razorpay Error: ' + res.getBody()
        );
    }
}