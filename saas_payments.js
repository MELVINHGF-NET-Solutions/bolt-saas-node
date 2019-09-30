var rp = require('request-promise');
var crypto = require('crypto');
var _ = require('lodash');

class SaaSPayments {
	constructor(options){
		if (!options || !options.shared_key)
			throw "options.shared_key required";
		if (!options.secret_key)
			throw "options.secret_key required";
		
		this.shared_key = options.shared_key;
		this.secret_key = options.secret_key;
		this.host = options.host || "https://payments.withbolt.com";
	}

	_sign(methodName, options) {
		if (!this.shared_key || !this.secret_key || !methodName || !options)
			throw "missing mandatory fields to generate a signature";

		var timestamp = options._timestamp || new Date().getTime();

		// Copy the request so we dont manipulate the original object and remove reserved words
		var signatureBody = JSON.parse(JSON.stringify(options));
		signatureBody = JSON.stringify(_.omit(signatureBody, "host", "nonce"));

		return this.shared_key + "-" + timestamp + "-" + crypto.createHash('md5').update(timestamp + methodName + signatureBody + this.secret_key).digest("hex");
	}

	_convertSetupOptions(options) {
		return _.defaults({
			"instanceKey": options.instance_key,
			"companyName": options.company_name,
			"contactName": options.contact_name,
			"contactPhone": options.contact_phone,
			"contactEmail": options.contact_email,
			"countryCode": options.company_country,
			"referralCode": false
		}, options);
	}

	setupButton (options) {
		if (!options || !options.instance_key)
			throw "options.instance_key required";

		options = this._convertSetupOptions(options);

		return new Buffer(JSON.stringify(options)).toString("base64");
	}

	setupSignature (options) {
		if (!options || !options.instance_key)
			throw "options.instance_key required";

		options = this._convertSetupOptions(options);

		return this._sign("doSetup", options);
	}

	setupUrl (options) {
		if (!options || !options.instance_key)
			throw "options.instance_key required";

		options = this._convertSetupOptions(options);

		var signature = this._sign("doSetup", options);
		var query = new Buffer(JSON.stringify(options)).toString("base64");

		var unsignedOptions = new Buffer(JSON.stringify({
			signature: signature
		})).toString("base64");

		return this.host + "/c/" + (options.channel_key || "setup") 
				+ "/#/api/setup/" + query + "/" + unsignedOptions;
	}

	getSetup (options) {
		if (!options.instance_key)
			throw "instance_key required";

		return rp({
			method: "GET",
            uri: `${this.host}/c/api/instances/${options.instance_key}/setup/payments`,
            auth: {
                "user": this.secret_key
            },
            headers: [{
                name: "content-type",
                value: "application/json"
            }]
		}).then((response) => {
			return _.isString(response) ? JSON.parse(response) : response;
		}).catch((err) => {
			this._handleError(err);
		});
	}

	_convertPaymentOptions(options) {
		var account = options.account;
		var accountKey = _.isString(account) ? account : (account || {}).id;

		return _.defaults({
			"instanceKey": options.instance_key,
			"currency": options.currency,
			"amount": options.amount,
			"defaultAmount": options.default_amount,
			"altKey": options.alt_key,
			"orderDesc": options.description,
			"channelTitle": options.title,
			
			"accountKey": accountKey,
			"crm": account ? {
				"address": account.address ? {
					"country": account.address.country,
					"line1": account.address.line1,
					"line2": account.address.line2,
					"line3": account.address.line3,
					"line4": account.address.line4,
					"line5": account.address.line5,
					"line6": account.address.line6
				} : undefined,
				"tag": account.alt_key,
				"firstname": account.first_name,
				"lastname": account.last_name,
				"company": account.company,
				"email": account.email,
				"phone": account.phone
			} : undefined,

			"successUrl": options.success_url,
			"cancelUrl": options.cancel_url,
			
			"channelKey": options.channel_key || "web",

			"authOrCapture": options.action,
	        "frequency": options.frequency,
	        "defaultFrequency": options.default_frequency,
	        "isFiniteOccurrences": options.occurrences ? "TRUE" : undefined,
	        "defaultIsFiniteOccurrences": options.default_occurrences ? "TRUE" : undefined,
	        "occurrences": options.occurrences,
	        "defaultOccurrences": options.default_occurrences,
	        "delayedStart": options.start_date || options.start_days ? "TRUE" : undefined,
	        "defaultDelayedStart": options.default_start_date || options.default_start_days ? "TRUE" : undefined,
	        "startDate": options.start_date,
	        "defaultStartDate": options.default_start_date,
	        "startDays": options.start_days,
	        "defaultStartDays": options.default_start_days,
	        "saveCard": options.save_card,
	        "defaultSaveCard": options.default_save_card,
	        "checkoutText": options.checkout_text,
	        "skipReceipt": options.skip_receipt,
	        
			"disableMyDetails": "TRUE",
			"nonce": options.nonce || ("bolt_" + new Date().getTime())
		}, _.omit(options, "account"));
	}

	paymentButton (options) {
		if (!options || !options.instance_key)
			throw "options.instance_key required";

		options = this._convertPaymentOptions(options);

		return new Buffer(JSON.stringify(options)).toString("base64");
	}
 
 	paymentSignature (options) {
		if (!options || !options.instance_key)
			throw "options.instance_key required";

		options = this._convertPaymentOptions(options);

		return this._sign("doPayment", options);
	}

	paymentUrl (options) {
		if (!options || !options.instance_key)
			throw "options.instance_key required";

		options = this._convertPaymentOptions(options);

		var signature = this._sign("doPayment", options);
		var query = new Buffer(JSON.stringify(options)).toString("base64");

		return this.host + "/c/" + (options.channel_key || "web") 
				+ "/api/doPayment?q=" + query + "&signature=" + signature;
	}

	doPayment(options) {
		if (!options || !options.instance_key)
			throw "options.instance_key required";

		return rp({
			method: "POST",
            uri: `${this.host}/c/api/instances/${options.instance_key}/payments`,
            auth: {
                "user": this.secret_key
            },
            headers: [{
                name: "content-type",
                value: "application/json"
            }],
            json: {
            	"payment": _.omit(options, "instance_key")
            }
		}).catch((err) => {
			this._handleError(err);
		});
	}

	getPayment(instance_key, payment_key) {
		if (!instance_key)
			throw "instance_key required";
		else if (!payment_key)
			throw "payment_key required";

		return rp({
			method: "GET",
            uri: `${this.host}/c/api/instances/${instance_key}/payments/${payment_key}`,
            auth: {
                "user": this.secret_key
            },
            headers: [{
                name: "content-type",
                value: "application/json"
            }]
		}).then((response) => {
			return _.isString(response) ? JSON.parse(response) : response;
		}).catch((err) => {
			this._handleError(err);
		});
	}

	getWebhook (webhook_body, options) {
		if (!webhook_body || !webhook_body.application || !webhook_body.instance_key)
			throw "webhook_body invalid, are you sure this came from Bolt?";

		return Promise.resolve()
		.then(() => {
			var url = webhook_body.payment ? `${this.host}/c/api/instances/${webhook_body.instance_key}/payments/${webhook_body.payment}` : 
				_.startsWith(webhook_body.action, "REFUND.") ? `${this.host}/c/api/instances/${webhook_body.instance_key}/refunds/${webhook_body.transaction}` : undefined;
			if(url) {
				return rp({
					method: "GET",
		            uri: url,
		            auth: {
		                "user": this.secret_key
		            },
		            headers: [{
		                name: "content-type",
		                value: "application/json"
		            }]
				});
			}
		}).then((response) => {
			response = _.isString(response) ? JSON.parse(response) : response;
			return _.defaults(response || {}, webhook_body);
		}).catch((err) => {
			this._handleError(err);
		});
	}

	doRefund(options) {
		if (!options || !options.instance_key)
			throw "options.instance_key required";

		return rp({
			method: "POST",
            uri: `${this.host}/c/api/instances/${options.instance_key}/payments/${options.payment}/refund`,
            auth: {
                "user": this.secret_key
            },
            headers: [{
                name: "content-type",
                value: "application/json"
            }],
            json: {
            	"refund": {
            		"amount": options.amount,
            		"reason": options.reason
            	}
            }
		}).catch((err) => {
			this._handleError(err);
		});
	}

	getRefund(instance_key, refund_key) {
		if (!instance_key)
			throw "instance_key required";
		else if (!refund_key)
			throw "refund_key required";

		return rp({
			method: "GET",
            uri: `${this.host}/c/api/instances/${instance_key}/refunds/${refund_key}`,
            auth: {
                "user": this.secret_key
            },
            headers: [{
                name: "content-type",
                value: "application/json"
            }]
		}).then((response) => {
			return _.isString(response) ? JSON.parse(response) : response;
		}).catch((err) => {
			this._handleError(err);
		});
	}

	_handleError(err) {
		var error = err.error || err;
		if(_.isString(error)) {
			try {
				error = JSON.parse(error);
			} catch(e) {}
		}

		if(error.errorMessages) {
			var errorCode = ((error.errorMessages || [])[0] || {}).code;
			error.code = errorCode == "BOLT-1119" || errorCode == "1158" ? "FORBIDDEN" : errorCode || "UNKNOWN";
			error.message = _.reduce(error.errorMessages, (message, error) => {
			    if(error.message.match(/{[0-9]}/) && error.field) {
                    error.message = error.message.replace(/{[0-9]}/, error.field);
                }
                return message + (message ? ", " : "") + error.message;
            }, "");
		}

		throw {
			"code": error.code || err.statusCode || "UNKNOWN",
			"message": error.message || error
		};
	}

}

module.exports = SaaSPayments;