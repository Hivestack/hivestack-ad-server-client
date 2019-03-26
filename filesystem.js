fileSystem = null;
window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;

function initFileSystem()
{
    navigator.webkitPersistentStorage.requestQuota(1024*1024*1024, function(grantedBytes) {
        debugWrite('Granted ' + grantedBytes + ' bytes');
        window.requestFileSystem(PERSISTENT, grantedBytes, function(fileSystemObj) {
            debugWrite('File system initialized');
            fileSystem = fileSystemObj;
        }, errorHandler);
    }, errorHandler);
}

function readIfFileExists(filename, callbackFile, callbackFileDoesNotExist)
{
    fileSystem.root.getFile(filename, {create : false}, function(fileEntry) {
        var localFileUrl = fileEntry.toURL();
        callbackFile(fileEntry.toURL())
    }, callbackFileDoesNotExist);
}

function saveToFile(filename, dataBlob, callbackSuccess)
{
    debugWrite("Saving data to " + filename);
    fileSystem.root.getFile(filename, {create: true, exclusive: true}, function(fileEntry) {
        // Create a FileWriter object for our FileEntry (log.txt).
        fileEntry.createWriter(function(fileWriter) {
            fileWriter.onwriteend = function(e) {
                if (callbackSuccess) {
                    callbackSuccess();
                }
            };

            fileWriter.onerror = function(e) {
                debugWrite('Write failed: ' + e.toString());
            };

            fileWriter.write(dataBlob);

        }, errorHandler);
    }, errorHandler);
}

function queryRemainingSpace(callback)
{
    navigator.webkitPersistentStorage.queryUsageAndQuota (
        function(usedBytes, grantedBytes) {
            var current = Math.round((usedBytes / 1024 / 1024) * 100) / 100;
            var maxAllowed = Math.round((grantedBytes / 1024 / 1024) * 100) / 100;
            if (callback)
            {
                callback(current, maxAllowed);
            }
            else
            {
                debugWrite('Current file cache usage: ' + current.toString() + ' MB of ' + maxAllowed.toString() + ' MB');
            }
        },
        function(e) { console.log('Error', e);  }
    );
}

function testReadFile(filename)
{
    readIfFileExists(filename, function(fileBlob) {
    }, function() {
        debugWrite('File did not exist')
    })
}

function testSaveFile(filename, dataText)
{
    var blob = new Blob([dataText], {type: 'text/plain'});
    saveToFile(filename, blob);
}

function deleteFile(filename)
{
    fileSystem.root.getFile(filename, {create: false}, function(fileEntry) {
        fileEntry.remove(function() {
            debugWrite('File ' + fileEntry.name + ' removed.');
        }, errorHandler);

    }, errorHandler);
}

function getFilesCount(callback)
{
    var dirReader = fileSystem.root.createReader();
    dirReader.readEntries (function(results) {
        callback(results.length);
    });
}

function purgeAllFiles()
{
    var entries = [];
    var dirReader = fileSystem.root.createReader();
    dirReader.readEntries (function(results) {
        debugWrite('Deleting ' + results.length + ' files');
        results.forEach(function(fileEntry) {
            fileEntry.remove(function() {
                debugWrite('File ' + fileEntry.name + ' removed.');
            }, errorHandler)});
    }, errorHandler);
}

function listAllFiles()
{
    var entries = [];
    var dirReader = fileSystem.root.createReader();
    dirReader.readEntries (function(results) {
        debugWrite('There are ' + results.length + ' files');
        results.forEach(function(fileEntry) {
            debugWrite(' -> ' + fileEntry.name);
        });
    }, errorHandler);
}


function errorHandler(e)
{
    debugWrite('Error: ' + e.name + ' - ' + e.message);
}
