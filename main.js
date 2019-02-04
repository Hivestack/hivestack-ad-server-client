chrome.app.runtime.onLaunched.addListener(function() {
  var screenWidth = screen.availWidth;
  var screenHeight = screen.availHeight;
  var width = 500;
  var height = 300;

  chrome.app.window.create('client.html', 
    {
      id: "mainWindowId"
    }, 
    function(window) 
    {
      window.fullscreen();
    });
});
