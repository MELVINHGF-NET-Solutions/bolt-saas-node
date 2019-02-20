var _ = require('lodash');
var fs = require('fs');
var SaaSPayments = require("../saas_payments");


QUnit.module("saas_payments", {
});

var tests = JSON.parse(fs.readFileSync("test/tests.js"));
var payments = new SaaSPayments(tests.options);

_.map(tests.setup, (test, i) => {
	QUnit.test("setupButton" + i, function (assert) {
		var value = payments.setupButton(test.options)
		assert.equal(value, test.button, "encoded correctly");	
	});

	QUnit.test("setupSignature" + i, function (assert) {
		var value = payments.setupSignature(_.defaults({_timestamp: test.signature_timestamp}, test.options));
		assert.equal(value, test.signature, "encoded correctly");	
	});

	QUnit.test("setupUrl" + i, function (assert) {
		var value = payments.setupUrl(test.options)
		assert.equal(value.replace(/\/[^/]*$/, ""), test.url.replace(/\/[^/]*$/, ""), "encoded correctly");	
	});

	QUnit.test("getSetup" + i, function (assert) {
		assert.expect(1);
		return payments.getSetup(test.getSetup)
		.then((value) => {
			// console.log("Output: " + JSON.stringify(value));
			assert.ok(value.payments_ready, "setup payments_ready");
		});
	});
});

_.map(tests.payment, (test, i) => {
	QUnit.test("paymentButton" + i, function (assert) {
		var value = payments.paymentButton(test.options)
		assert.equal(value, test.button, "encoded correctly");	
	});

	QUnit.test("paymentSignature" + i, function (assert) {
		var value = payments.paymentSignature(_.defaults({_timestamp: test.signature_timestamp}, test.options));
		assert.equal(value, test.signature, "encoded correctly");	
	});

	QUnit.test("paymentUrl" + i, function (assert) {
		var value = payments.paymentUrl(test.options)
		assert.equal(value.replace(/signature.*/, ""), test.url.replace(/signature.*/, ""), "encoded correctly");	
	});

	QUnit.test("doPayment" + i, function (assert) {
		assert.expect(8);
		var payment = _.defaults({}, test.doPayment_defaults, test.options);

		return payments.doPayment(payment)
		.then((doPayment) => {
			console.log("Payment: " + JSON.stringify(doPayment));
			assert.ok(doPayment.payment, "object created");
			assert.equal(doPayment.payment.gateway_status, "APPROVED", "payment approved");

			return payments.getPayment(payment.instance_key, doPayment.payment.id)
			.then((getPayment) => {
				console.log("getPayment: " + JSON.stringify(doPayment));
				assert.ok(doPayment.payment.id, getPayment.payment.id, "get matched post");

				return payments.doRefund({
					instance_key: payment.instance_key, 
					payment: doPayment.payment.id, 
					amount: 1
				});
			}).then((doRefund) => {
				console.log("Refund: " + JSON.stringify(doRefund));
				assert.ok(doRefund.refund.id, "doRefund returned id");
				assert.equal(doRefund.refund.gateway_status, "APPROVED", "refund success");

				return payments.getRefund(payment.instance_key, doRefund.refund.id)
				.then((getRefund) => {
					console.log("getRefund: " + JSON.stringify(getRefund));
					assert.equal(doRefund.refund.id, getRefund.refund.id, "getRefund returned id");
				}).then(() => {
					var payment_webhook = {
						action: "PAYMENT.SUCCESS",
						application: "TEST",
						instance_key: payment.instance_key,
						payment: doPayment.payment.id
					};

					var refund_webhook = {
						action: "REFUND.SUCCESS",
						application: "TEST",
						instance_key: payment.instance_key,
						transaction: doRefund.refund.id
					};

					return payments.getWebhook(payment_webhook)
					.then((getWebhook) => {
						console.log("getWebhook (payment): " + JSON.stringify(getWebhook));
						assert.equal(getWebhook.payment.id, payment_webhook.payment, "getWebhook(payment) returned id");

						return payments.getWebhook(refund_webhook);						
					}).then((getWebhook) => {
						console.log("getWebhook (refund): " + JSON.stringify(getWebhook));
						assert.equal(getWebhook.refund.id, refund_webhook.transaction, "getWebhook(refund) returned id");
					});
				});
			})
		});
	});
});




