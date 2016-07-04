javascript:(function(){

	console.log("customizing...");

	document.querySelector( ".banner" ).style.backgroundColor="#DE1F26";
	console.log("banner background set");

	document.querySelector( ".banner" ).style.backgroundImage="none";
	console.log("removed gradient");

	document.querySelectorAll( ".banner h1" ).forEach(function(n) {
		n.style.color="#FCF593";
	});
	console.log("set font color");
	
	var n;
	var tn;

	// Replace first banner with "see you photos here"
	n=document.querySelector(".banner > h1:nth-child(1)");
	while(n.hasChildNodes()) {
		n.removeChild(n.childNodes[0]);
	}
	tn = document.createTextNode("See your photos here on the screen!");
	n.appendChild(tn);		

	// Replace second banner with "Download CapsuleCam and use join code"
	n=document.querySelector(".banner > h1:nth-child(2)");
	n.removeChild(n.childNodes[1]);
	tn = document.createTextNode("Download");
	n.insertBefore(tn, 	n.firstChild);		
	

	// remove Instagram
	n=document.querySelector(".banner > h1:nth-child(4)");
	while(n.hasChildNodes()) {
		n.removeChild(n.childNodes[0]);
	}
	tn = document.createTextNode("Don't forget to stop by the photo booth!");
	n.appendChild(tn);
	
	// adjust brought to you by
	document.querySelector(".banner > h1:nth-child(5) > img").src="https://www.jasonandann.net/images/logo2-gold.png";
	console.log("brought to you by");

	// adjust logo
})();

