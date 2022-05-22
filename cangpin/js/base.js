

	

jQuery(function($) {



/*___Contents Width Control
----------------------------------------------------------*/

  	checkBreakPoint();
	
	if (window.addEventListener) {
	    window.addEventListener("resize", function() {
	   checkBreakPoint();
	   }, false);
	}
	
	else {
	   $(window).resize(function() {
		checkBreakPoint();
	});
	
	}

	function checkBreakPoint() {
    var width = (window.innerWidth || document.documentElement.clientWidth || 0);
    var height = (window.innerHeight || document.documentElement.clientHeight || 0);
	
	    if (width <= 768) {
	      $(".page-inner").css("width", "auto");
	    }
	    else if (width <= 1023) {
	      $(".page-inner").css("width", "auto");
	    }
	    else if (width <= 1365) {
	      $(".page-inner").css("width", "68%");
	      $(".works-single-contents img").css("max-height", "none");
		  $(".works-contents img").css("max-height", "none");
	    }
	    else {
	      $(".page-inner").css("width", height - 36);
		  $(".works-single-contents img").css("max-height", height - 36);
		  $(".works-contents img").css("max-height", height - 36);
	    }
  	}





/*----------------------------------------------------------------------
___Cycle Slideshow
----------------------------------------------------------------------*/


if($('#slider').length) {
	
	$('#slider').cycle({ 
	    fx:     'fade', 
	    speed:  500, 
	    next:   '#slider', 
	    timeout: 5000 
	});
}

if($('.slider-iv').length) {
	
	$('.slider-iv').each(function() {
	    var $this = $(this);
	    $this.cycle({
	        fx:     'fade', 
	        speed:  500, 
	        timeout:  0,
	        
	        // use slideshow as the transition trigger
	        next:     $this,
	        
	        // update caption div after transition
	        after:    function(curr,next,opts) {
	            var s = 'Image ' + (opts.currSlide + 1) + ' / ' + opts.slideCount;
	            $(opts.caption).html(s);
	        },
	        
	        // capture the caption div in the options object
	        caption:  $this.closest('.item-image-set').find('p.cycle-caption')
	    });
	});
}	
    
    
    

 
/*___Fullpage Menu
----------------------------------------------------------*/  
  
	  
$(function () {
	    $(".mobile-nav").fullpageMenu();
	    
	    $("#menu-icon").click(function() {
        	$(".mobile-nav").openMenu();
			return false;
      	});
      	
        $(".biography-nav li a").click(function() {
        	$(".mobile-nav").closeMenu();
        });
}); 
	  



/*___Smooth Scroll
----------------------------------------------------------*/  


$(function(){
    $('a[href*=#], area[href*=#]').not(".noScroll").click(function() {

      
        var speed = 1000,
            href = $(this).prop("href"),
            hrefPageUrl = href.split("#")[0],
            currentUrl = location.href,
            currentUrl = currentUrl.split("#")[0];

        if(hrefPageUrl == currentUrl){

            href = href.split("#");
            href = href.pop();
            href = "#" + href;

            var target = $(href == "#" || href == "" ? 'html' : href),
                position = target.offset().top,
                body = 'body',
                userAgent = window.navigator.userAgent.toLowerCase();
            if (userAgent.indexOf('msie') > -1 || userAgent.indexOf('trident') > -1 || userAgent.indexOf("firefox") > -1 ) { /*IE8.9.10.11*/
                body = 'html';
            }
            $(body).animate({
                scrollTop: position
            }, speed, 'swing', function() {

                if(href != "#top" && href !="#") {
                    location.href = href; 
                }
            });

            return false;
        }

    });
});




/*___Back to Top
----------------------------------------------------------*/  
	
	
	$(".back-top").hide();
		$(function () {
   	 	    $(window).scroll(function () {
       	     if ($(this).scrollTop() > 500) {
            	    $('.back-top').fadeIn();
					} else {
						$('.back-top').stop(true, true).fadeOut();
					}
        });
        $('.back-top').click(function () {
            $('body,html').animate({
                scrollTop: 0
            }, 400);
            return false;
        });
    });
   




$(function(){
	$(window).load(function(){
		var delaySpeed = 100;
		var fadeSpeed = 400;
		$('img').each(function(i){
$(this).delay(i*(delaySpeed)).css({display:'block',opacity:'0'}).animate({opacity:'1'},fadeSpeed);
		});
	});
});





});
