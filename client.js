	// Keeps track of the ad currently playing for playlog purposes.
	var adToPlay;

	// Manage the queue of upcoming plays
	var adsQueue = [];
	var currentlyRequestingAd = false;
	var currentlyPlaying = false;
	var currentlySendingOfflinePlaylogs = false;
	var initialized = false;
    var playTimerId = null;
    var clientVersion = null;

    // Double buffering
	var currentImageElement = 0;
	var currentVideoElement = 0;
	var imageElements = [$('#myImage1'), $('#myImage2')];
    var videoElements = [$('#myVideo1'), $('#myVideo2')];
    var nextActiveElement = null;

    // Indicates if the app is running as a Chrome OS app
	var chromeAppMode = false;
	if (chrome.storage)
	{
		chromeAppMode = true;
	}

	// Chrome local storage is async. Load it all at app start and then work with this in-memory object.
	var chromeAppLocalStorageObject = {};

	// ----------------------------------------------
	//    Settings initialized from local storage
	// ----------------------------------------------

	// Show / hide the red Diagnostics box at the top-left of the page. Useful for debugging.
	var DEBUG_ShowDiagnostics;
	var hivestackUrl;

	// Controls whether a black spot or a fallback / placeholder creative should be played if Hivestack says there is nothing to play
	// The Fallback Image URL can be a web URL, a local file, or a data URI (ex: data:image/png;base64,/9j/4AAQSkZJRgABAQEASABIAAD...)
	var useFallback;
	var fallbackCreativeUrl;
	var fallbackDurationSeconds;

	// UUID of the screen this app controls. Refer to the Ad Server to obtain it.
	var screenUUID;

	var offlineCreativesCache = {};
	var lastCreativesPlayed = [];
	var offlinePreviousCreativesToKeep = 10;
	var offlinePlaylogs = [];
	var currentCacheIndex = 0;
	var creativesBeingDownloaded = {};
	var downloadedCreativesToKeep = 100;

	// ----------------------------------------------
	//    End of settings
	// ----------------------------------------------

	function play()
	{
		if (!playTimerId)
		{
			var timeUntilPrequeue = adToPlay.duration - 1;
			if (timeUntilPrequeue < 1) {
                timeUntilPrequeue = 1;
			}
            playTimerId = setTimeout(spotOver, timeUntilPrequeue * 1000);
            debugWrite('The ad is playing for ' + adToPlay.duration + ' seconds.');
            logPlay();
        }
        else
		{
            debugWrite('Attempted a double play with timer ID ' + playTimerId);
		}
	}

	function spotOver()
	{
		playTimerId = null;
		//debugWrite("Done playing this ad");
		currentlyPlaying = false;
		playSpot();
	}

	// Called when the image / video has finished loading.  We assume that the ad has played if the creative has been loaded properly
	function mediaFinishedLoading()
	{
		//debugWrite('Finished loading ' + this.src);
		//play();
	}

	// Helper debug function
	function debugWrite(message)
	{
		$('#debug-text').html($('#debug-text').html() + '<p style="margin: 2px 0px 2px 0px">' + " - " + message + '</p>');
		if ($('#debug-text').children().length > 30)
		{
			$('#debug-text').children()[1].remove()
		}
	}

	function saveLocalDataHtml(key, value)
	{
		localStorage.setItem(key, value);
	}

	function saveLocalDataChrome(keyvaluepairs, callback)
	{
		chrome.storage.local.set(keyvaluepairs, callback);
	}

	function loadLocalData(key, value)
	{
		if (chromeAppMode == true)
		{
			return chromeAppLocalStorageObject[key]
		}
		else
		{
			return localStorage.getItem(key);
		}
	}

	function clearLocalData(callback)
	{
		if (chromeAppMode == true)
		{
			chrome.storage.local.clear(callback);
		}
		else
		{
			localStorage.clear();
			callback();
		}
	}

	function reloadApp()
	{
		if (chromeAppMode == true)
		{
			chrome.runtime.reload();
		}
		else
		{
			window.location.reload();
		}
	}

	function fillChromeAppLocalStorageObject(callback)
	{
		chrome.storage.local.get(null, function(data) {
			chromeAppLocalStorageObject = data;
			callback();
		});
	}

	// Called when Player orders the ad to play. Will record a playlog only if the creative has been loaded properly.
	function logPlay()
	{
		if (adToPlay != null && adToPlay.isFallback == false)
		{
			if (adToPlay.isOffline == false && navigator.onLine == true)
			{
				$.ajax(
				{
					method: "GET",
					url: adToPlay.reportUrl,
					success: function(data)
					{
						debugWrite('Logged a playlog for ' + adToPlay.creativeUrl);
					},
					error: function(data)
					{
						debugWrite('Failed to log a playlog for ' + adToPlay.creativeUrl + ". Error: " + data.status + " - " + data.statusText + '(' + data.responseText + ')');
					}
				})
            }
            else
			{
                debugWrite('Logging an offline playlog');
                reportUrlSplit = adToPlay.reportUrl.split('/');
				playUUID = reportUrlSplit[reportUrlSplit.length - 1];
				offlinePlaylogs.push({
					'played_at_utc': new Date().toISOString(),
					'playlog_uuid': playUUID,
					'creative_url': adToPlay.creativeUrl
				});
                saveOfflinePlaylogsData();
                setTimeout(refreshUI, 300);
			}
		}
		else
		{
			// debugWrite('Tried to log a playlog for a skipped ad');
		}
	}

	// Starting point, called when page is ready
	function main()
	{
		if (!fileSystem)
		{
			debugWrite("File system not ready.");
			setTimeout(main, 200);
			return;
		}

        $.getJSON("manifest.json", function(json) {
            debugWrite('Client version: ' + json['version']);
            clientVersion = json['version'];
            $('#clientName').text(json['name']);
            $('#clientVersion').text(json['version']);
        });

		setTimeout(prefetchCreatives, 10000); // Wait 10 seconds for playback to get started and prefetch the remaining creatives
		setTimeout(deleteOldCreatives, 12000);

		setInterval(function() { $('#queueDepth').text(adsQueue.length) }, 100);
		refreshUI();
        setInterval(refreshUI, 5000);

		$('html').on('dblclick', function() {
			$('#settings').show();
		});

		$('#settingsSave').on('click', function()
		{
			if (!$('#adServerUrl').val() || !$('#screenUUID').val() || !$('#fallbackDurationSeconds').val())
			{
				$('#settingsError').show();
			}
			else
			{
				if (chromeAppMode == true)
				{
					saveLocalDataChrome(
						{
							"DEBUG_ShowDiagnostics": $('#DEBUG_ShowDiagnostics').prop('checked').toString(),
							"hivestackUrl": $('#adServerUrl').val(),
							"screenUUID": $('#screenUUID').val(),
							"useFallback": "true",
							"fallbackCreativeUrl": "hivestack-fallback-logo.png",
							"fallbackDurationSeconds": $('#fallbackDurationSeconds').val(),
                            "offlinePreviousCreativesToKeep": $('#offlinePreviousCreativesToKeep').val()
						}, reloadApp);
				}
				else
				{
					saveLocalDataHtml("DEBUG_ShowDiagnostics", $('#DEBUG_ShowDiagnostics').prop('checked'));
					saveLocalDataHtml("hivestackUrl", $('#adServerUrl').val());
					saveLocalDataHtml("screenUUID", $('#screenUUID').val());

					saveLocalDataHtml("useFallback", "true");
					saveLocalDataHtml("fallbackCreativeUrl", "hivestack-fallback-logo.png");
					saveLocalDataHtml("fallbackDurationSeconds", $('#fallbackDurationSeconds').val());
                    saveLocalDataHtml("offlinePreviousCreativesToKeep", $('#offlinePreviousCreativesToKeep').val());
					
					reloadApp();
				}

			}
		});

		$('#settingsClear').on('click', function() {
			clearLocalData(reloadApp);
		});

        $('#settingsClose').on('click', function() {
            $('#settings').hide();
        });

        $('#clearLogs').on('click', function() {
            while ($('#debug-text').children().length > 1)
            {
                $('#debug-text').children()[1].remove()
            }
        });

        $('#listCache').on('click', function() {
            listAllFiles();
        });

        $('#purgeCache').on('click', function() {
            offlineCreativesCache = {};
            lastCreativesPlayed = [];
            saveOfflineCreativeData();
            purgeAllFiles();
            setTimeout(refreshUI, 300);
        });

        $('#prefetchCreatives').on('click', function() {
            prefetchCreatives();
        });

        $('#purgeOfflinePlaylogs').on('click', function() {
        	purgeOfflinePlaylogs();
        });

        $('#sendOfflinePlaylogs').on('click', function() {
            sendOfflinePlaylogs();
        });

		if (!loadLocalData("screenUUID"))
		{
			$('#settings').show();
			$('#debug-container').hide();
		}
		else
		{
			DEBUG_ShowDiagnostics = loadLocalData("DEBUG_ShowDiagnostics") == 'true';
			hivestackUrl = loadLocalData("hivestackUrl");
			screenUUID = loadLocalData("screenUUID");

			useFallback = loadLocalData("useFallback") == 'true';
			fallbackCreativeUrl = loadLocalData("fallbackCreativeUrl");
			fallbackDurationSeconds = parseFloat(loadLocalData("fallbackDurationSeconds"));
			offlinePreviousCreativesToKeep = parseInt(loadLocalData("offlinePreviousCreativesToKeep"));

			offlineCreativesCacheString = loadLocalData('offlineCreativesCache');
			if (offlineCreativesCacheString)
			{
                offlineCreativesCache = JSON.parse(offlineCreativesCacheString);
			}
            lastCreativesPlayedString = loadLocalData('lastCreativesPlayed');
            if (lastCreativesPlayedString)
            {
                lastCreativesPlayed = JSON.parse(lastCreativesPlayedString);
            }
            offlinePlaylogsString = loadLocalData('offlinePlaylogs');
            if (offlinePlaylogsString)
            {
                offlinePlaylogs = JSON.parse(offlinePlaylogsString);
            }

			locationFileFormat = "js";

			// Fill the settings screen with the loaded values
			$('#adServerUrl').val(hivestackUrl);
			$('#screenUUID').val(screenUUID);
			$('#fallbackDurationSeconds').val(fallbackDurationSeconds);
            $('#offlinePreviousCreativesToKeep').val(offlinePreviousCreativesToKeep);
			$('#DEBUG_ShowDiagnostics').prop('checked', DEBUG_ShowDiagnostics);

			hivestackUrl = hivestackUrl + "/nirvana/api/v1";

			// Shows the debug infos area if in debug mode
			if (DEBUG_ShowDiagnostics) 
			{
				$('#debug-container').show();
			}

			imageElements[0].on('load', mediaFinishedLoading);
            imageElements[1].on('load', mediaFinishedLoading);
            videoElements[0].on('canplay', mediaFinishedLoading);
            videoElements[1].on('canplay', mediaFinishedLoading);
            imageElements[0].on('error', function() { skipSpot(); });
            imageElements[1].on('error', function() { skipSpot(); });
            videoElements[0].on('error', function() { skipSpot(); });
            videoElements[1].on('error', function() { skipSpot(); });

			refreshUI();

			if (screenUUID == null)
			{
				loadLocationFile();
			}
			else
			{
				initPlay();
			}
		}
	}

	// Loads the Screen UUID from the screenid.js file
	function loadLocationFile()
	{
		var head = document.getElementsByTagName('head')[0];
		var script = document.createElement('script');

		script.type = 'text/javascript';
		script.src = "screenid.js";
		script.onload = initPlay;

		head.appendChild(script);
	}

	function requestAd()
	{
		if (adsQueue.length < 1 && currentlyRequestingAd == false)
		{
			currentlyRequestingAd = true;

			$.ajax(
			{
				method: "GET",
				url: hivestackUrl + '/units/' + screenUUID + '/schedulevast',
				success: function(data)
				{
					// Online connectivity confirmed. Send offline playlogs if needed
                    sendOfflinePlaylogs();

					currentlyRequestingAd = false;

					if (data != null)
					{
					    if (typeof(data) == 'string')
						{
						    data = $.parseXML(data)
						}

						// TODO handle no-report VAST (fallback creative)
				        impressionNode = data.getElementsByTagName("Impression");
                        mediafileNode = data.getElementsByTagName("MediaFile");
                        durationNode = data.getElementsByTagName("Duration");
						if (impressionNode.length == 0 || mediafileNode.length == 0 || durationNode.length == 0)
						{
                            debugWrite('Ad Server replied that there was nothing to play.');
                            skipSpot();
                            return;
						}

                        var reportUrl = impressionNode[0].childNodes[1].nodeValue.trim();
                        var creativeCompleteUrl = mediafileNode[0].childNodes[1].nodeValue.trim();
                        var format = mediafileNode[0].getAttributeNode('type').nodeValue.trim();
                        var durationString = durationNode[0].childNodes[0].nodeValue.trim().split(':');
                        var duration = durationString[0] * 3600 + durationString[1] * 60 + durationString[2] * 1;

						var spotFormatted =
						{
							creativeUrl: creativeCompleteUrl,
							format: format,
	                        reportUrl: reportUrl,
	                        duration: duration,
	                        isFallback: false,
							isOffline: false,
                            lastPlayedOnUtc: new Date().toISOString()
						};

                        debugWrite('Successfully received an ad from Hivestack');
                        adsQueue.push(spotFormatted);

                        downloadAndSaveCreativeToDisk(creativeCompleteUrl);

						if (initialized == false)
						{
							initialized = true;
							var cachedCreative = offlineCreativesCache[creativeCompleteUrl];
							if (cachedCreative)
							{
                                playSpot();
                            }
                            else
							{
                                debugWrite('First play ever, nothing is cached. Waiting a few seconds for creatives to load.');
                                setTimeout(playSpot, 3000);
                            }
						}
					}
					else
					{
                        debugWrite('Ad Server replied that there was nothing to play.');
						skipSpot();
					}
				},
				error: function(data)
				{
					currentlyRequestingAd = false;
					debugWrite('Error requesting an ad from Hivestack. Will play offline. Error: ' + data.status + " - " + data.statusText + '(' + data.responseText + ')');
                    playOfflineSpotFromCache();
				}
			});
		}
	}

	// Gets a play from the ad server and plays it
	function initPlay()
	{
		setInterval(requestAd, 1000);
	}

	function playSpot()
	{
		if (currentlyPlaying == false)
		{
            // debugWrite('Checking queue, length is ' + adsQueue.length);
            if (adsQueue.length != 0)
            {
                currentlyPlaying = true;
                adToPlay = adsQueue.splice(0, 1)[0];

                if (adToPlay.creativeUrl != fallbackCreativeUrl && adToPlay.isOffline == false)
                {
                    offlineCreativesCache[adToPlay.creativeUrl] = adToPlay;

                    lastCreativesPlayed.push(adToPlay.creativeUrl);
                    if (lastCreativesPlayed.length > offlinePreviousCreativesToKeep)
                    {
                        lastCreativesPlayed.shift()
                    }

                    saveOfflineCreativeData();
                }

                prepareFileForPlay(adToPlay.creativeUrl, adToPlay.format);
                setTimeout(bringActiveElementToFront, 1000);
            }
            else
			{
                // Unexpected state encountered. Try again after a small delay
                debugWrite('Queue was unexpectedly empty. Will re-attempt playing once a new ad is loaded');
                //setTimeout(playSpot, 3000)
            }
        }
	}

	// Either plays a fallback image or orders the player to skip it this ad altogether
	function skipSpot()
	{
		var fallbackSpot =
		{
			creativeUrl: fallbackCreativeUrl,
			format: null,
            reportUrl: null,
            duration: fallbackDurationSeconds,
            isFallback: true,
			isOffline: true,
			lastPlayedOnUtc: new Date().toISOString()
		};

		adsQueue.push(fallbackSpot);

		if (initialized == false)
		{
			initialized = true;
			playSpot();
		}
	}

    function playOfflineSpotFromCache()
    {
    	creativeToPlay = lastCreativesPlayed[currentCacheIndex % lastCreativesPlayed.length];
        currentCacheIndex++;

        if (!creativeToPlay)
		{
			skipSpot();
			return;
		}
		cachedCreativeMetadata = offlineCreativesCache[creativeToPlay];
    	if (!cachedCreativeMetadata)
		{
			skipSpot();
			return;
		}

        var offlineSpot =
		{
			creativeUrl: cachedCreativeMetadata.creativeUrl,
			format: cachedCreativeMetadata.format,
			reportUrl: cachedCreativeMetadata.reportUrl,
			duration: cachedCreativeMetadata.duration,
			isFallback: false,
			isOffline: true,
            lastPlayedOnUtc: new Date().toISOString()
		};

        adsQueue.push(offlineSpot);

        if (initialized == false)
        {
            initialized = true;
            playSpot();
        }
    }

    function getActiveImageElement()
	{
		return imageElements[currentImageElement % 2];
	}

    function getActiveVideoElement()
    {
        return videoElements[currentVideoElement % 2];
    }

    function bringActiveElementToFront()
	{
		if (nextActiveElement)
		{
			imageElements[0].css('display', 'none');
            imageElements[1].css('display', 'none');
            videoElements[0].css('display', 'none');
            videoElements[1].css('display', 'none');
            videoElements[0][0].pause();
            videoElements[1][0].pause();
            nextActiveElement.css('display', 'inline');
            if (nextActiveElement.is('video'))
			{
				nextActiveElement[0].play();
			}
			play();
		}
	}

    // Setups a creative based on its mimetype or extension
	function prepareFileForPlay(filename, mimetype) {
		var creativeExtension;

		if (mimetype != null)
		{
			var splitMimetype = mimetype.split('/');
			creativeExtension = splitMimetype[splitMimetype.length - 1].toLowerCase();
		}
		else
		{
			var splitFilename = filename.split('.');
			creativeExtension = splitFilename[splitFilename.length - 1].toLowerCase();
		}

		currentImageElement++;
		currentVideoElement++;
		var img = getActiveImageElement();
		var vid = getActiveVideoElement();

		switch (creativeExtension)
		{
			case 'jpg':
			case 'jpeg':
			case 'png':
			case 'gif':
			case 'bmp':
			case 'svg':
				nextActiveElement = img;
				loadCreative(img, vid, filename);
				break;

			case 'mp4':
			case 'mov':
			case 'webm':
			case 'avi':
			case 'wmv':
				nextActiveElement = vid;
                loadCreative(vid, img, filename);
				break;
			default:
				//No extension: assume it's an image
				nextActiveElement = img;
				loadCreative(img, vid, filename);
				break;
		}
	}

function loadCreative(elemToUse, elemToHide, filename)
{	
	// Chrome Apps require a workaround to load external images
	if (chromeAppMode == true)
	{
		var filenameForStorage = getFilenameForStorage(filename);
		if (filename == fallbackCreativeUrl) {
            nextActiveElement.attr('src', fallbackCreativeUrl);
		}
		else {
            // Check if we have the file available locally
            //debugWrite('Loading creative ' + filename);
            readIfFileExists(filenameForStorage, function (localFileUrl) {
                debugWrite('Playing creative from cache');
                nextActiveElement.attr('src', localFileUrl);
            }, function () {
                debugWrite('Told to play a creative that was not yet downloaded. Skipping.');
                adToPlay.duration = fallbackDurationSeconds;
                adToPlay.isFallback = true;
                nextActiveElement = getActiveImageElement();
                nextActiveElement.attr('src', fallbackCreativeUrl);
            });
        }
	}
	else 
	{
        nextActiveElement.attr('src', filename);
	}
}

function downloadAndSaveCreativeToDisk(filename)
{
    var filenameForStorage = getFilenameForStorage(filename);
    var alreadyBeingDownloadadCreative = creativesBeingDownloaded[filename];
    if (alreadyBeingDownloadadCreative)
	{
		return;
	}

	// Check if we have the file available locally
	readIfFileExists(filenameForStorage, function (localFileUrl) {
		// File already exists, do nothing
	}, function () {
		debugWrite('Downloading creative ' + filename);
		creativesBeingDownloaded[filename] = new Date();
		var xhr = new XMLHttpRequest();
		xhr.open('GET', filename, true);
		xhr.responseType = 'blob';
		xhr.onload = function (e) {
			saveToFile(filenameForStorage, this.response, function() {
				var timeTaken = new Date() - creativesBeingDownloaded[filename];
				debugWrite('Successfully downloaded and saved file ' + filename + ' to the cache as ' + filenameForStorage + ' in ' + timeTaken / 1000 + 's')
				delete creativesBeingDownloaded[filename]
			});
		};
		xhr.onerror = function (e) {
			debugWrite("Error downloading creative " + filename);
			delete creativesBeingDownloaded[filename]
		};

		xhr.send();
	});
}

function deleteOldCreatives()
{
    setTimeout(deleteOldCreatives, 10 * 60 * 1000); // run again in 10 minutes
	var creativesCacheSize = Object.keys(offlineCreativesCache).length;

	debugWrite('Checking if old files should be deleted. Files count: ' + creativesCacheSize + '/' + downloadedCreativesToKeep);
	if (creativesCacheSize > downloadedCreativesToKeep)
	{

		var offlineCreativesArray = [];
		for (var filename in offlineCreativesCache)
		{
			if (!offlineCreativesCache[filename].lastPlayedOnUtc)
			{
                offlineCreativesCache[filename].lastPlayedOnUtc = "1980-01-01T00:00:00.000Z"
			}
			offlineCreativesArray.push(offlineCreativesCache[filename])
		}

        offlineCreativesArray.sort(function(a, b) {return a.lastPlayedOnUtc.localeCompare(b.lastPlayedOnUtc)});

		var extraCreatives = offlineCreativesArray.length - downloadedCreativesToKeep;
		oldestCreativesToDelete = offlineCreativesArray.slice(0, extraCreatives);

		debugWrite('Deleting ' + extraCreatives + ' files');
		oldestCreativesToDelete.forEach(function(creative) {
            deleteFile(getFilenameForStorage(creative.creativeUrl));
			delete offlineCreativesCache[creative.creativeUrl];
		});
    }
}

function getFilenameForStorage(filename)
{
	return filename.split('/').join('').split(':').join('');
}

function prefetchCreatives()
{
	debugWrite("Prefetching creatives");
    $.ajax(
        {
            method: "GET",
            url: hivestackUrl + '/units/' + screenUUID + '/creatives',
            success: function(data)
            {
                debugWrite('There are ' + data.length + ' active creatives. Downloading the missing ones.');
                data.forEach(function(elem) {
                    downloadAndSaveCreativeToDisk(elem['url']);
				});
                setTimeout(prefetchCreatives, 60 * 60 * 1000); // run again in 1 hour

            },
            error: function(data)
            {
                debugWrite('Failed to prefetch creatives.');
                setTimeout(prefetchCreatives, 10 * 60 * 1000); // run again in 10 minutes
            }
        });

    setTimeout(prefetchCreatives, 60 * 60 * 1000); // run again in 1 hour
}

function saveToDisk(filename, bytes)
{
    chrome.fileSystem.getWritableEntry(chosenFileEntry, function(writableFileEntry) {
        writableFileEntry.createWriter(function(writer) {
            writer.onerror = function() { debugWrite('Error saving file ' + filename) };
            writer.onwriteend = function() { debugWrite('Done saving file ' + filename) };

            chosenFileEntry.file(function(file) {
                writer.write(file);
            });
        }, errorHandler);
    });
}

function refreshUI()
{
    getFilesCount(function(filesCount) {
        $('#cachedFilesCount').text(filesCount);
    });

	queryRemainingSpace(function(current, maxAllowed) {
        $('#cacheMbUsage').text(current);
        $('#cacheMbMax').text(maxAllowed);
	});

    $('#offlinePlaylogsCount').text(offlinePlaylogs.length);

    $('#onlineStatus').text(navigator.onLine ? 'Online': 'Offline')
}

function saveOfflineCreativeData()
{
    offlineCreativesCacheStringified = JSON.stringify(offlineCreativesCache);
    lastCreativesPlayedStringified = JSON.stringify(lastCreativesPlayed);

    if (chromeAppMode == true)
    {
        saveLocalDataChrome(
            {
                "offlineCreativesCache": offlineCreativesCacheStringified,
                "lastCreativesPlayed": lastCreativesPlayedStringified
            });
    }
    else
    {
        saveLocalDataHtml("offlineCreativesCache", offlineCreativesCacheStringified);
        saveLocalDataHtml("lastCreativesPlayed", lastCreativesPlayedStringified);
    }
}

function saveOfflinePlaylogsData()
{
	offlinePlaylogsStringified = JSON.stringify(offlinePlaylogs);

	if (chromeAppMode == true)
	{
		saveLocalDataChrome(
			{
				"offlinePlaylogs": offlinePlaylogsStringified
			});
	}
	else
	{
		saveLocalDataHtml("offlinePlaylogs", offlinePlaylogsStringified);
	}
}

function sendOfflinePlaylogs()
{
	if (offlinePlaylogs.length == 0 || currentlySendingOfflinePlaylogs)
	{
		return;
	}

    debugWrite('Attempting to report ' + offlinePlaylogs.length + ' offline playlogs');
    currentlySendingOfflinePlaylogs = true;

    $.ajax(
	{
		method: "POST",
        url: hivestackUrl + '/units/' + screenUUID + '/reportofflineplays',
		data: JSON.stringify(offlinePlaylogs),
		success: function(data)
		{
			debugWrite('Successfully confirmed ' + data['confirmed_offline_plays'] + ' offline playlogs');
			offlinePlaylogs = [];
            setTimeout(refreshUI, 300);
            saveOfflinePlaylogsData();
            currentlySendingOfflinePlaylogs = false;
		},
		error: function(data)
		{
			debugWrite('Failed to send Offline Playlogs. Will retry later.');
            currentlySendingOfflinePlaylogs = false;
		}
	});
}

function purgeOfflinePlaylogs()
{
	debugWrite('Purged ' + offlinePlaylogs.length + ' offline playlogs');
	offlinePlaylogs = [];

    setTimeout(refreshUI, 300);
    saveOfflinePlaylogsData();
}

initFileSystem();

// Starts the whole thing!
if (chromeAppMode == true)
{
	fillChromeAppLocalStorageObject(main);
}
else
{
	main();
}