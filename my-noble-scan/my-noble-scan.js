
module.exports = function(RED) {
    "use strict";

    var noble = require('noble');
    var os = require('os');
    
    // The main node definition - most things happen in here
    function NobleScan(n) {
        // Create a RED node
        RED.nodes.createNode(this,n);

        var node = this;
        var machineId = os.hostname();
        var scanning = false;

        noble.on('discover', function(peripheral) {
			if(peripheral.id === '2471894daeb6'){
				//node.log(peripheral);
				var msg = { payload:{peripheralUuid:peripheral.uuid, localName: peripheral.advertisement.localName} };
				msg.peripheralUuid = peripheral.uuid;
				msg.localName = peripheral.advertisement.localName;
				msg.detectedAt = new Date().getTime();
				msg.detectedBy = machineId;
				msg.advertisement = peripheral.advertisement;
				msg.rssi = peripheral.rssi;

				// Check the BLE follows iBeacon spec
				if (peripheral.manufacturerData) {
					if (peripheral.manufacturerData.length >= 25) {
						var proxUuid = peripheral.manufacturerData.slice(4, 20).toString('hex');
						var major = peripheral.manufacturerData.readUInt16BE(20);
						var minor = peripheral.manufacturerData.readUInt16BE(22);
						var measuredPower = peripheral.manufacturerData.readInt8(24);

						var accuracy = Math.pow(12.0, 1.5 * ((rssi / measuredPower) - 1));
						var proximity = null;

						if (accuracy < 0) {
							proximity = 'unknown';
						} else if (accuracy < 0.5) {
							proximity = 'immediate';
						} else if (accuracy < 4.0) {
							proximity = 'near';
						} else {
							proximity = 'far';
						}

						msg.manufacturerUuid = proxUuid;
						msg.major = major;
						msg.minor = minor;
						msg.measuredPower = measuredPower;
						msg.accuracy = accuracy;
						msg.proximity = proximity;
					}
				}
				//node.log(peripheral.advertisement.serviceUuids);
				if (peripheral.advertisement.serviceUuids == 'b000') {
					var advData = JSON.parse(peripheral).advertisement.manufacturerData.data;
					node.log('------------------');
					for(var i = 0; i < advData.length; i++){
						if(advData[i] == 255) {
							var magnetfielddata = advData.slice(i, advData.length);
							var magX = concatenateBytes(magnetfielddata[1], magnetfielddata[2]);
							var magY = concatenateBytes(magnetfielddata[3], magnetfielddata[4]);
							var magZ = concatenateBytes(magnetfielddata[5], magnetfielddata[6]);
							msg.magnetfielddata = { 'data': magnetfielddata, 'X': magX, 'Y': magY, 'Z': magZ };
							break;
						}
					}
				}

				// Generate output event
				node.log(JSON.stringify(msg));
				node.log('------------------');
				node.send(msg);
			}
        });
		
		function concatenateBytes(byte1, byte2) {
			node.log(byte1 + " " + byte2);
			var concatenated = byte1 << 8 | byte2; //Results in one integer
			return concatenated;
		}
		
		

        // Take care of starting the scan and sending the status message
        function startScan(stateChange, error) {
			node.log('Start scan entered');
            if (!node.scanning) {
                // send status message
                var msg = {
                    statusUpdate: true,
                    error: error,
                    stateChange: stateChange,
                    state: noble.state
                };
                node.send(msg);
                // start the scan
                noble.startScanning(node.uuids, true, function() {
                    node.log("Scanning for BLEs started. UUIDs: " + node.uuids + " - Duplicates allowed: true");
                    node.status({fill:"green",shape:"dot",text:"started"});
                    node.scanning = true;
                });
            }
        }

        // Take care of stopping the scan and sending the status message
        function stopScan(stateChange, error) {
            if (node.scanning) {
                // send status message
                var msg = {
                    statusUpdate: true,
                    error: error,
                    stateChange: stateChange,
                    state: noble.state
                };
                node.send(msg);
                // stop the scan
                noble.stopScanning(function() {
                    node.log('BLE scanning stopped.');
                    node.status({fill:"red",shape:"ring",text:"stopped"});
                    node.scanning = false;
                });
                if (error) {
                    node.warn('BLE scanning stopped due to change in adapter state.');
                }
            }
        }

        // deal with state changes
        noble.on('stateChange', function(state) {
            if (state === 'poweredOn') {
                startScan(true, false);
            } else {
                if (node.scanning) {
                    stopScan(true, true);
                }
            }
        });

        // start initially
        if (noble.state === 'poweredOn') {
            startScan(false, false);
        } else {
            // send status message
            var msg = {
                statusUpdate: true,
                error: true,
                stateChange: false,
                state: noble.state
            };

            // TODO: Catch a global event instead eventually
            setTimeout(function(){
                node.send(msg);
            }, 3000);

            node.warn('Unable to start BLE scan. Adapter state: ' + noble.state);
        }

        // control scanning
        node.on('input', function (msg) {
            if (msg.hasOwnProperty("payload") && typeof msg.payload == "object" && msg.payload.hasOwnProperty("scan")) {
                if (msg.payload.scan === true) {
                    startScan(false, false);
                    return;
                } else if (msg.payload.scan === false) {
                    stopScan(false, false);
                    return;
                }
            }
            node.warn("Incorrect input, ignoring. See the documentation in the info tab. ");
        });

    
        node.on("close", function() {
            // Called when the node is shutdown - eg on redeploy.
            // Allows ports to be closed, connections dropped etc.
            // eg: this.client.disconnect();
            stopScan(false, false);
            // remove listeners since they get added again on deploy
            noble.removeAllListeners();
        });    }
    
    // Register the node by name. This must be called before overriding any of the
    // Node functions.
    RED.nodes.registerType("bluuki_scan_noble",NobleScan);

}
