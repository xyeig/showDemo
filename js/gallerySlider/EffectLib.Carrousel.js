/**
 * @description  图片轮播(旋转木马)2D,3D效果,外部可以通过配置来切换2d和3d效果
 * 轮播图片小于3张时，无法使用loop效果
 * @author dailc
 * @version 1.0
 * @time 2016-12-12 
 * https://github.com/dailc
 */
(function(exports) {
	var touchSupport = ('ontouchstart' in document || 'ontouchstart' in window);
	//定义Class
	var CARROUSEL_CLASS_STATE = 'dai-carrousel-state';
	var CARROUSEL_CLASS_CONTAINER = 'dai-carrousel-container';
	/**
	 * @constructor 构造函数
	 * @description 图片轮播的构造函数
	 * @param {JSON} options
	 * isLoop 是否循环
	 * containerSelector 容器的选择器
	 * itemSelector 元素的选择器,默认为img
	 * 有两种效果,3d和2d
	 * 3d效果必须支持touch而且长度大于2才能开启
	 */
	function Carrousel(options) {
		var self = this;
		self.resetOptions(options);
		self.initListeners();
		self.api = self.initApi();
		return self._carrousel;
	}
	/**
	 * @description 绑定监听函数,包括手势touch监听,resize监听
	 */
	Carrousel.prototype.initListeners = function() {
		var self = this;
		//每当item change时会触发这个回调
		self.itemChangedHandler = null;
		self.bindTouchEvent();
		//监听resize
		window.addEventListener('resize', function() {
			self.resize();
		});
	};
	/**
	 * @description 重新设置options,可以动态变化，dom内容也可以变化
	 * @param {JSON} options 配置参数,如果没有新的配置,则默认使用老配置
	 */
	Carrousel.prototype.resetOptions = function(options) {
		var self = this;
		options = options || self.options || {};
		self.options = options;
		if(self.api && self.itemClickHandles) {
			self.api.unBindItemClickHandler();
		}
		var mainContainer = document.querySelector(options.containerSelector);
		var container = mainContainer,
			state = mainContainer;
		if(!container.classList.contains(CARROUSEL_CLASS_CONTAINER)) {
			//找到Container
			container = container.querySelector('.' + CARROUSEL_CLASS_CONTAINER);
		}
		if(!state.classList.contains(CARROUSEL_CLASS_STATE)) {
			//找到Container
			state = state.querySelector('.' + CARROUSEL_CLASS_STATE);
		}
		self.state = state;
		self.container = container;
		var itemsDom = document.querySelectorAll(options.itemSelector);
		var len = itemsDom.length;
		self.itemsDom = itemsDom;
		var isLoop = options.isLoop && len > 2;
		self.isLoop = isLoop;
		//生成一个新的链表
		self.items = new DataStruct.LinkList({
			"isLoop": isLoop || false
		});
		//默认为2d效果,必须设置3d才是3d效果
		self.is3D = options.is3D || false;

		for(var i = 0; i < len; i++) {
			var tmpNode = new DataStruct.Node(itemsDom[i]);
			//需要手动设置index
			tmpNode.index = i;
			self.items.append(tmpNode);
		}
		self.itemLen = itemsDom.length;
		//当前对象的外部引用,不直接开放整个原型
		self._carrousel = {};
		//当前激活的为头节点
		self._current = self.items.head;
		//上一个节点
		self._prev = null;
		//如果3d而且不循环,而且存在next,则取next
		if(self.is3D && !isLoop && self._current._next) {
			self._prev = self._current;
			self._current = self._current._next;
		}
		if(self.oldItemClickCallback && self.api) {
			self.api.bindItemClickHandler(self.oldItemClickCallback);
		}
		//手动调用一次resize
		self.resize();

	};
	/**
	 * @description 窗口resize事件
	 */
	Carrousel.prototype.resize = function() {
		var self = this;
		var len = self.itemsDom.length;
		var maxHeight = 0;
		for(var i = 0; i < len; i++) {
			var item = self.itemsDom[i];
			item.style.visibility = 'hidden';
			var originalHeight = item.style.height;
			var originalWidth = item.style.width;
			item.style.height = self.options.itemHeight || originalHeight;
			item.style.width = self.options.itemWidth || originalWidth;
			var img = item.querySelector('img');
			if(img) {
				img.style.height = options.itemImgHeight || 'auto';
			}
			if(item.offsetHeight > maxHeight) {
				maxHeight = item.offsetHeight;
			}
		}

		var winWith = window.innerWidth;
		self.isPad = winWith >= 768 ? true : false;
		//计算 perspective与container的ztransform
		//perspective 宽度为320时为200较佳 宽为768时为340较佳
		var perspective = (winWith - 320) * 160 / 448 + 200;
		//320 0  768 -40
		var translateZ = (winWith - 320) * (-50) / 448 + 0;
		//判断是否是pad,pad上和普通手机上差别比较大
		self.isPad = winWith >= 768 ? true : false;
		//设置舞台参数,使用最大高度的一个元素高
		self.state.style.height = maxHeight + 'px';
		self.transformItem(self.state, {
			'translateX': 0,
			'translateY': 0,
			'translateZ': 0
		});
		self.perspectiveItem(self.state, perspective);
		//设置container参数
		self.transformItem(self.container, {
			'translateX': 0,
			'translateY': 0,
			//这个z用来缩放视角
			'translateZ': translateZ
		});

		//当前轮播Item的宽度
		self.sliderWidth = self._current.data.offsetWidth;
		//当前容器的宽度,用来计算
		self.containerWidth = self.container.offsetWidth;
		//当前容器和slider item之间的gap
		self.gap = (self.containerWidth - self.sliderWidth) / 2;

		//初始化位置与显式隐藏
		self.showItemItems(self._current, true);
		self.resetPosition();

	};
	/**
	 * @description 将相应的item进行transform动画
	 * @param {HTMLElement} item 相应的dom
	 * @param {JSON} options translate需要的参数,包括
	 * translateX x轴的位移
	 * translateZ z轴的位移
	 * rotate Y轴的旋转角度
	 */
	Carrousel.prototype.transformItem = function(item, params) {
		var self = this;
		var rotateStr = '';
		params = params || {};
		params.rotate = params.rotate || 0;
		params.translateZ = params.translateZ || 0;
		params.translateX = params.translateX || 0;
		params.translateY = params.translateY || 0;

		if(params.isShow) {
			item.style.visibility = 'visible';
		}
		if(params.rotate) {
			rotateStr = 'rotateY(' + params.rotate + 'deg)';
		}
		var transformStr = "translate3d(" + params.translateX + "px,0,0)";
		if(self.is3D) {
			transformStr = "translate3d(" + params.translateX + "px," + params.translateY + "px," + params.translateZ + "px) " + rotateStr;
		}
		item.style.transform = transformStr;
		item.style.webkitTransform = transformStr;
		item.style.MozTransform = transformStr;

	};
	/**
	 * @description 将相应的item进行perspective设置
	 * @param {HTMLElement} item 相应的dom
	 * @param {Number} perspective 
	 */
	Carrousel.prototype.perspectiveItem = function(item, perspective) {
		var perspectiveStr = perspective + 'px';
		item.style.perspective = perspectiveStr;
		item.style.webkitPerspective = perspectiveStr;
		item.style.MozPerspective = perspectiveStr;
	};
	/**
	 * @description 根据传入的translateX计算各自的Z和rotate
	 * 里面的一些参数是经过了微调的
	 * @param {Number} translateX
	 * @param {Boolean} isChangeVisible 是否需要改变显示
	 */
	Carrousel.prototype.getTranslateParamsByTranslate = function(translateX, isChangeVisible) {
		var self = this;
		var baseDegree = 30;
		var baseRotateZ = 0;
		//offset,兼容下pad里的z
		var zOffset = self.isPad ? 40 : 0;
		var baseZ = 58 + zOffset;
		var degree = (translateX - self.gap) / self.sliderWidth;
		var rotate = baseDegree * degree;
		var z = 8 + zOffset;
		var isShow;

		if(degree >= 0) {
			var base = self.sliderWidth - self.gap;
			z = z - baseZ * degree
			if(isChangeVisible) {
				var base = self.sliderWidth * 2 + self.gap;
				if(translateX < base) {
					isShow = true;
				}
			}
		} else {
			var base = -self.sliderWidth + self.gap;
			z = z + baseZ * degree
			if(isChangeVisible) {
				var base = self.sliderWidth * 2 - self.gap;
				if(translateX > -base) {
					isShow = true;
				}
			}
		}
		if(rotate > 90) {
			rotate = 90;
		} else if(rotate < -90) {
			rotate = -90;
		}
		//判断是否进行opacity变化,_next._next和_pre._pre才会变化
		return {
			translateX: translateX,
			translateZ: z,
			rotate: rotate,
			isShow: isShow
		};
	};
	/**
	 * @description 给某一个node设置相关node的位移
	 * @param {Node} node DataStruct里的node
	 * @param {Number} translateX x轴的位移
	 */
	Carrousel.prototype.transformItems = function(node, translateX) {
		var self = this;
		if(!node) {
			return;
		}

		if(node._prev) {
			var translate = -self.sliderWidth + self.gap + translateX;
			var params = self.getTranslateParamsByTranslate(translate);

			self.transformItem(node._prev.data, params);
			if(node._prev._prev && node._prev._prev !== node._next) {
				var translate = -self.sliderWidth * 2 + self.gap + translateX;
				var params = self.getTranslateParamsByTranslate(translate, true);

				self.transformItem(node._prev._prev.data, params);
			}
		}

		if(node._next) {
			var translate = self.sliderWidth + self.gap + translateX;
			var params = self.getTranslateParamsByTranslate(translate);
			self.transformItem(node._next.data, params);
			if(node._next._next && node._next._next !== node._prev) {
				var translate = self.sliderWidth * 2 + self.gap + translateX;
				var params = self.getTranslateParamsByTranslate(translate, true);
				self.transformItem(node._next._next.data, params);
			}

		}
		var translate = self.gap + translateX;
		var params = self.getTranslateParamsByTranslate(translate);
		self.transformItem(node.data, params);
	};
	/**
	 * @description 将相应的item进行transitionItem动画
	 * @param {HTMLElement} item 相应的dom
	 * @param {String} transition 相应的transition动画
	 */
	Carrousel.prototype.transitionItem = function(item, transition) {
		item.style.transition = transition;
		item.style.webkitTransition = transition;
		item.style.MozTransition = transition;
	};

	/**
	 * @description 给某一个node设置过度动画或者取消过度动画
	 * @param {Node} node DataStruct里的node
	 * @param {Boolean} isTransition 是否需要过度
	 * @param {String} animation 是否有自定义动画字符串
	 */
	Carrousel.prototype.transitionItems = function(node, isTransition, animation) {
		if(!node) {
			return;
		}
		var self = this;
		var animationStr = animation || "300ms ease ";
		var transition = isTransition ? animationStr : "";
		if(node._prev) {
			self.transitionItem(node._prev.data, transition);
			if(node._prev._prev) {
				self.transitionItem(node._prev._prev.data, transition);
			}
		}

		if(node._next) {
			self.transitionItem(node._next.data, transition);
			if(node._next._next) {
				self.transitionItem(node._next._next.data, transition);
			}
		}

		self.transitionItem(node.data, transition);

	};
	/**
	 * @description 重新将所有相关的items都进行position
	 */
	Carrousel.prototype.resetPosition = function() {
		var self = this;
		self.transformItems(self._current, 0);
	};

	/**
	 * @description 切换item的显示与隐藏,当item不再显示区域时，暂时隐藏
	 * @param {HTMLElement} item 相应的dom
	 * @param {Boolean} isShow  是否显示
	 * 直接用 visibility 的显示与隐藏
	 */
	Carrousel.prototype.showItem = function(item, isShow) {
		if(isShow) {
			//item.style.opacity = 1;
			item.style.visibility = 'visible';
		} else {
			//item.style.opacity = 0;
			item.style.visibility = 'hidden';
		}
	};

	/**
	 * @description 切换相关Node的item的显示与隐藏,当item不再显示区域时，暂时隐藏
	 * @param {Node} node 链表中的node节点
	 * @param {Number} zindex 
	 * @param {Object} isShow
	 */
	Carrousel.prototype.showItemItems = function(node, isShow) {
		if(!node) {
			return;
		}
		var self = this;

		if(node._prev) {
			self.showItem(node._prev.data, isShow);
		}

		if(node._next) {
			self.showItem(node._next.data, isShow);
		}

		self.showItem(node.data, isShow);
	};

	/**
	 * @description 轮播组件进行动画
	 * @param {Number} translateX  x轴的位移(通过这个来判断是回滚还是不回滚)
	 * @param {Boolean} isRollback 是否回滚
	 * @param {String} animation 是否使用自定义动画
	 */
	Carrousel.prototype.move = function(translateX, isRollback, animation) {
		var self = this;
		if(isRollback) {
			//为当前元素添加过渡
			self.transitionItems(self._current, true, animation);
			self.resetPosition();
			return;
		} else {
			var next;
			//判断下一个元素的位置是前驱还是后继,还是前驱的前驱，后继的后继
			if(translateX > 0) {
				next = self._current._prev;
				if(next && next._prev && translateX > self.sliderWidth) {
					next = next._prev;
				}
			} else {
				next = self._current._next;
				if(next && next._next && translateX < -self.sliderWidth) {
					next = next._next;
				}
			}
			if(next) {
				//为当前元素添加过渡
				self.transitionItems(self._current, true, animation);
				//记录上一个节点
				self._prev = self._current;
				self._current = next;
				//前一个元素相关的隐藏,本元素相关的显示
				self.showItemItems(self._prev, false);
				self.showItemItems(self._current, true);

				self.resetPosition();

				self.itemChangedHandler && self.itemChangedHandler(self._prev.index, self._current.index);
			}
		}

	};

	/**
	 * @description 位移动画，比如手势滑动时需要进行位移动画
	 * @param {Number} translateX  x轴的位移
	 */
	Carrousel.prototype.transform = function(translateX) {
		var self = this;
		//小于0代表start位置在右边，从右滑向左，页面向左滑动
		//大于0代表start位置在左边，从左滑向右，页面向右滑动
		//否则等于0,相当于重新定位即可
		self.transformItems(self._current, translateX);

	};
	/**
	 * @description 绑定手势监听
	 */
	Carrousel.prototype.bindTouchEvent = function() {
		var self = this;
		var startX, startY;
		//是否发生左右滑动
		var isMove = false;
		//记录手指按下去的时间
		var startT = 0;
		var translate = 0;
		if(self.isBindTouch || !touchSupport) {
			return;
		}
		var container = self.container;
		self.isBindTouch = true;
		container.setAttribute('ontouchstart', '');

		container.addEventListener("touchstart", function(e) {
			//android中需要加上这行注释，要不然touchmove和touchend都会被fired
			//加了这个后,会与普通的click事件冲突
			e.preventDefault();
			var touch = e.touches[0];
			startX = touch.clientX;
			startY = touch.clientY;
			self.transitionItem(container, '');
			startT = new Date().getTime(); //记录手指按下的开始时间
			isMove = false;
			self.transitionItems(self._prev, false); //取消之前元素的过渡
			self.transitionItems(self._current, false); //取消当前元素的过渡
		}, false);

		/*手指在屏幕上滑动，页面跟随手指移动*/
		container.addEventListener("touchmove", function(e) {
			// e.preventDefault();//取消此行代码的注释会在该元素内阻止页面纵向滚动
			var touch = e.touches[0];
			var deltaX = touch.clientX - startX;
			var deltaY = touch.clientY - startY;
			//如果X方向上的位移大于Y方向，则认为是左右滑动
			if(Math.abs(deltaX) > Math.abs(deltaY)) {
				if(deltaX > 0) {
					translate = Math.min(deltaX, 2 * self.sliderWidth);
				} else {
					translate = Math.max(deltaX, -2 * self.sliderWidth);
				}
				self.transform(translate);

				isMove = true;
			}
		}, false);

		/*手指离开屏幕时，计算最终需要停留在哪一页*/
		container.addEventListener("touchend", function(e) {
			// e.preventDefault();//取消此行代码的注释会在该元素内阻止页面纵向滚动

			//是否会滚
			var isRollback = false;

			//计算手指在屏幕上停留的时间
			var deltaT = new Date().getTime() - startT;
			if(isMove) { //发生了左右滑动
				//如果停留时间小于300ms,则认为是快速滑动，无论滑动距离是多少，都停留到下一页
				if(deltaT < 300) {
					translate = translate < 0 ? -self.sliderWidth : self.sliderWidth;
				} else {
					//如果滑动距离小于屏幕的50%，则退回到上一页
					if(Math.abs(translate) / self.sliderWidth < 0.5) {
						isRollback = true;
					} else {
						//如果滑动距离大于屏幕的50%，则滑动到下一页
						translate = translate < 0 ? -self.sliderWidth : self.sliderWidth;
					}
				}

				self.move(translate, isRollback);
			}
		}, false);

	};
	/**
	 * @description 给某一个dom绑定tap事件
	 * 这里没有区分longtap和短tap 默认都是tap
	 * @param {HTMLElement} dom
	 * @param {Function} callback
	 */
	Carrousel.prototype.bindTapEvent = function(dom, callback) {
		var self = this;
		var startTx, startTy;
		var endTx, endTy;
		var touchstartFn = function(e) {
			var touches = e.touches[0];
			startTx = touches.clientX;
			startTy = touches.clientY;
		};
		dom.addEventListener('touchstart', touchstartFn, false);

		var touchendFn = function(e) {
			var touches = e.changedTouches[0];
			endTx = touches.clientX;
			endTy = touches.clientY;
			if(Math.abs(startTx - endTx) < 6 && Math.abs(startTy - endTy) < 6) {
				callback.apply(this, [e]);
			}
		};
		dom.addEventListener('touchend', touchendFn, false);
		self.itemClickHandles && self.itemClickHandles.push({
			'touchstartFn': touchstartFn,
			'touchendFn': touchendFn,
			'dom': dom
		});
	};
	/**
	 * @description 对外开放api
	 */
	Carrousel.prototype.initApi = function() {
		var self = this;
		var api = self._carrousel;

		//开放tap事件,因为这内部阻止了click事件
		//通过unbind可以解绑
		api.tap = function(dom, callback) {
			if(typeof dom === 'string') {
				dom = document.querySelectorAll(dom);
				if(dom.length) {
					for(var i = 0, len = dom.length; i < len; i++) {
						self.bindTapEvent(dom[i], callback);
					}
				}
			} else {
				self.bindTapEvent(dom, callback);
			}

		};
		//绑定监听回调
		api.bindItemChangedHandler = function(callback) {
			self.itemChangedHandler = callback;
			return api;
		};
		//解绑监听
		api.unBindItemClickHandler = function() {
			if(!self.itemClickHandles) {
				return;
			}
			for(var i = 0, len = self.itemClickHandles.length; i < len; i++) {
				var tmp = self.itemClickHandles[i];
				tmp.dom.removeEventListener('click', tmp.clickFn);
				tmp.dom.removeEventListener('touchstart', tmp.touchstartFn);
				tmp.dom.removeEventListener('touchend', tmp.touchendFn);
			}
			//设为没有绑定过
			self.isBindItemClick = false;

			return api;
		};
		//bindItemClickHandler 绑定item的点击监听
		api.bindItemClickHandler = function(callback) {
			//持有引用,每次reset时自动监听
			self.oldItemClickCallback = callback;
			//确保只监听一次
			if(self.isBindItemClick) {
				return api;
			}
			self.isBindItemClick = true;
			//记录clickHandle，可以用来取消
			self.itemClickHandles = [];
			//遍历链表
			self.items.traversal(function(node, done) {
				var index = node.index;
				var dom = node.data;
				var clickListener = function(e) {
					api.moveTo(index);
					callback.apply(this, [index, e]);
				};
				if(!touchSupport) {
					dom.addEventListener('click', clickListener, false);
					self.itemClickHandles.push({
						'clickFn': clickListener,
						'dom': dom
					});
				} else {
					self.bindTapEvent(dom, clickListener);
				}

			});
			return api;
		};

		//next 下一个
		api.next = function(duration) {
			duration = duration || 300;
			var str = duration + 'ms ease ';
			self.transitionItems(self._prev, false, str);
			self.move(-self.sliderWidth, false, str);

			return api;
		};

		//prev 上一个
		api.prev = function(duration) {
			duration = duration || 300;
			var str = duration + 'ms ease ';
			self.transitionItems(self._prev, false, str);
			self.move(self.sliderWidth, false, str);

			return api;
		};

		//moveTo,移动到某一个特定的index
		api.moveTo = function(dstIndex, duration) {
			duration = duration || 300;
			//计算offset,正常offset
			var offset = dstIndex - self._current.index;
			//横线offset,只有loop时才有作用
			var offset2 = offset > 0 ? (self.itemLen - offset) : (self.itemLen + offset);

			var apiPointer = this;
			var move;
			move = offset > 0 ? apiPointer.next : apiPointer.prev;
			if(self.isLoop) {
				if(Math.abs(offset) <= offset2) {
					move = offset > 0 ? apiPointer.next : apiPointer.prev;
				} else {
					move = offset > 0 ? apiPointer.prev : apiPointer.next;
					offset = offset2;
				}

			}
			var perDuration = Math.abs(offset ? duration / offset : duration);
			//递归调用
			var recursion = function() {
				if(offset) {
					offset = Math.abs(offset);
					if(offset > 0) {
						move && move(perDuration);
						offset--;
						setTimeout(function() {
							recursion();
						}, perDuration);
					}
				}
			};
			recursion();
		};

		//重置slider，比如切换3d和2d模式
		api.reset = function(options) {
			self.resetOptions(options);

			return api;
		};

		return api;
	};

	exports.Carrousel = Carrousel;
})(window.EffectLib = window.EffectLib || {});