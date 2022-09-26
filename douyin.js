// ==UserScript==
// @name         抖音评论筛选器 | Douyin Comment Picker
// @namespace    https://github.com/NewComer00
// @version      0.3.0
// @description  筛选搜索包含给定关键词的抖音评论 | Pick out the comments including the given keywords in Douyin.
// @author       NewComer00
// @match        https://www.douyin.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// @license      GPLv2且禁止商用 | GPLv2 AND Commercial use prohibited
// ==/UserScript==

(function () {
    'use strict';

    // ========================================================================
    // 使用说明
    //
    // 将脚本复制添加到Tampermonkey。使能该脚本，然后访问抖音官网，按下F12进入Console即可。
    // 在页面上方依次填写“视频关键词”“评论筛选关键词（空格隔开）”和“最大浏览视频数量”，然后点击“开始”。
    // 脚本运行中如被打断，刷新即可继续运行。脚本的中间结果会保存在浏览器的本地缓存文件中，随时可以再次从断点开始。
    // 如中途需要从头执行脚本，请先删除浏览器上抖音网站的浏览缓存数据，然后刷新抖音页面即可。
    // 执行完毕后，网页会弹出结果文件下载窗口。复制文件中所有内容，粘贴到Excel即可以表格方式查看。
    // 如需在脚本运行前排除先前浏览缓存数据的影响，可以点击“清除脚本缓存”按钮，然后刷新页面。
    // ========================================================================

    // ========================================================================
    // 脚本输入参数
    // ========================================================================

    // 网站域名。目前只适用于抖音，请不要更改
    const DOMAIN = 'www.douyin.com';

    // ========================================================================
    // 相关数据类型和函数
    // ========================================================================
    const strFormat = (str, ...args) => args.reduce((s, v) => s.replace('%s', v), str);
    const State = {
        Original: 'Original',
        One: 'One',
        Two: 'Two'
    }

    // 下载数据至本地文件
    // https://stackoverflow.com/a/30832210
    function download(data, filename, type) {
        var file = new Blob([data], { type: type });
        if (window.navigator.msSaveOrOpenBlob) // IE10+
            window.navigator.msSaveOrOpenBlob(file, filename);
        else { // Others
            var a = document.createElement("a"),
                url = URL.createObjectURL(file);
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 0);
        }
    }

    // 检查用户是否已经登录抖音
    function hasLoggedIn(body) {
        return body.innerHTML.search('退出登录') === -1 ? false : true;
    }

    // 如果已登录，不断下滑到页面底部，加载更多视频
    async function loopForVideo(body, maxVideoNum, regex) {
        // 确保先等待几秒，再获取页面视频编号
        function getVideoAfterDelay(body, regex) {
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(Array.from(body.innerHTML.matchAll(regex), m => m[1]));
                }, 2000);
            });
        }

        let videoIdArr;
        for (let videoNum = 0; videoNum < maxVideoNum;) {
            window.scrollTo(0, document.body.scrollHeight);
            videoIdArr = await getVideoAfterDelay(body, regex);
            videoIdArr = [...new Set(videoIdArr)]; // 去除重复的视频编号
            // 如果没有更多的视频了，不再继续获取视频
            if (videoIdArr.length <= videoNum) {
                break;
            }
            videoNum = videoIdArr.length;
        }
        return videoIdArr;
    }

    // ========================================================================
    // 分析视频页面的逻辑，可以自定义
    // ========================================================================
    function mainLogic(body, keywords) {
        // 获取HTML某节点下属所有的含文本节点
        // https://stackoverflow.com/a/10730777
        function textNodesUnder(el) {
            var n, a = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
            while (n = walk.nextNode()) a.push(n);
            return a;
        }

        // 视频页面上，所有带用户名和评论的节点大概长这样
        let nodeList = body.getElementsByClassName(
            "comment-mainContent")[0].getElementsByClassName('notranslate new-pmd');

        // 拼接nodeList中所有含文本节点的文字，拼接为字符串后放入textList中
        // 正确获取的textList中，从0开始偶数下标存放用户名，奇数存放其评论
        let textList = [];
        for (let node of nodeList) {
            textList.push(textNodesUnder(node).map(_ => _.data).join(''));
        }
        console.assert(textList.length % 2 === 0,
            'textList长度是奇数。长度应当是偶数，评论获取可能出错');

        console.log('获取到所有用户名及其评论如下：');
        console.log(textList);

        // 分离用户名和评论
        let users = textList.filter((v, i) => (i % 2) === 0);
        let comments = textList.filter((v, i) => (i % 2) === 1);

        // result存放检测到符合关键词要求的信息，每行格式如下：
        // 检测到的关键词\t发评论的用户\t评论内容\t视频页面链接\n
        let result = '';
        let url = window.location.href;
        for (let i = 0; i < comments.length; i++) {
            // 第i条评论中包含了哪些关键词
            let keywordsInComment = keywords.filter(
                k => comments[i].toLowerCase().includes(k.toLowerCase()));
            if (keywordsInComment.length > 0) {
                result += strFormat(
                    '%s\t%s\t%s\t%s\n', keywordsInComment, users[i], comments[i], url);
            }
        }
        return result;
    }

    // ========================================================================
    // 状态机
    // ========================================================================
    // 初始化状态信息
    let curState = localStorage.getItem('State');
    if (curState === null) {
        localStorage.setItem('State', State.Original);
        curState = State.Original;
    }

    // 检查视频关键词和评论关键词等本地缓存文件是否存在
    let target = localStorage.getItem('target'); // 视频关键词
    let keywords = localStorage.getItem('keywords'); // 视频下的评论筛选关键词，由空格分开
    let maxVideoNum = localStorage.getItem('maxVideoNum'); // 只筛选前几个视频，应当是非负整数
    if (target === null || keywords === null || maxVideoNum === null) {
        // 除非当前状态在初态，否则这些缓存文件都应当存在。不存在则回到初态
        if (curState !== State.Original) {
            console.log('没有找到视频关键词和评论关键词等的本地缓存文件\n'
                + '脚本将重置进度，请重新输入这些信息');
            localStorage.setItem('State', State.Original);
            curState = State.Original;
        }
    } else {
        // 代码运行到此处，证明视频关键词等信息都以字符串的形式存在
        // 将关键信息提取出来变成相应类型的常量，状态机除初态之外的核心逻辑都使用这些常量
        var TARGET = target; // string
        var KEYWORDS = keywords.split(' '); // array of string
        var MAX_VIDEO_NUM = parseInt(maxVideoNum); // int
    }

    switch (curState) {
        // 初态。加载脚本的用户交互组件，获取用户输入
        case State.Original:
            console.log("请在页面上填写相关筛选信息...");

            // 文本框，输入视频关键词
            var inputTarget = document.createElement("input");
            inputTarget.setAttribute('name', "inputTarget");
            inputTarget.setAttribute('type', "text");
            inputTarget.setAttribute('placeholder', "视频关键词");
            if (target !== null && target.length !== 0) {
                inputTarget.setAttribute('value', target);
            } else {
                inputTarget.setAttribute('value', '孙一峰');
            }
            document.getElementById('douyin-header').appendChild(inputTarget);

            // 文本框，输入视频下的评论筛选关键词
            var inputKeywords = document.createElement("input");
            inputKeywords.setAttribute('name', "inputKeywords");
            inputKeywords.setAttribute('type', "text");
            inputKeywords.setAttribute('placeholder', "评论筛选关键词，空格分隔");
            if (keywords !== null && keywords.length !== 0) {
                inputKeywords.setAttribute('value', keywords);
            } else {
                inputKeywords.setAttribute('value', 'ToSsGirL 西湖 大哥 F91');
            }
            document.getElementById('douyin-header').appendChild(inputKeywords);

            // 文本框，输入最大浏览视频数量
            var inputMaxVideoNum = document.createElement("input");
            inputMaxVideoNum.setAttribute('name', "inputMaxVideoNum");
            inputMaxVideoNum.setAttribute('type', "number");
            inputMaxVideoNum.setAttribute('min', "0");
            inputMaxVideoNum.setAttribute('step', "1");
            inputMaxVideoNum.setAttribute('placeholder', "最大浏览视频数量，数字");
            if (maxVideoNum !== null && maxVideoNum.length !== 0) {
                inputMaxVideoNum.setAttribute('value', maxVideoNum);
            } else {
                inputMaxVideoNum.setAttribute('value', '10');
            }
            inputMaxVideoNum.addEventListener('mouseup', (e) => {
                e.stopPropagation();
            });
            document.getElementById('douyin-header').appendChild(inputMaxVideoNum);

            // 按钮，控制"开始筛选评论"行为，这是最主要的功能
            var btnStart = document.createElement("button");
            btnStart.innerHTML = "开始筛选评论";
            // 点击按钮后...
            btnStart.onclick = function () {
                // 保存用户输入至本地缓存文件
                // TODO: 没有检测用户输入合法性
                target = inputTarget.value;
                localStorage.setItem('target', String(target));
                keywords = inputKeywords.value;
                localStorage.setItem('keywords', String(keywords));
                maxVideoNum = inputMaxVideoNum.value;
                localStorage.setItem('maxVideoNum', String(maxVideoNum));

                // 重定向至视频搜索结果页面，页面自动刷新后进入下一个状态
                console.log("正在根据关键词搜索视频...");
                localStorage.setItem('State', String(State.One));
                curState = State.One;
                var searchUrl = encodeURI(strFormat('https://%s/search/%s?&type=video', DOMAIN, target));
                window.location.href = searchUrl;
            };
            document.getElementById('douyin-header').appendChild(btnStart);

            // 按钮，手动删除和脚本相关的本地缓存文件
            var btnRmLocalStorage = document.createElement("button");
            btnRmLocalStorage.innerHTML = "清除脚本缓存";
            // 点击按钮后...
            btnRmLocalStorage.onclick = function () {
                console.log("正在清除脚本相关的本地缓存文件...");
                localStorage.removeItem('target');
                localStorage.removeItem('keywords');
                localStorage.removeItem('maxVideoNum');
                localStorage.removeItem('State');
                localStorage.removeItem('videoIdArr');
                localStorage.removeItem('videoCurIndex');
                localStorage.removeItem('Result');
                console.log("清除完成，用户刷新后将重新运行脚本");
            };
            document.getElementById('douyin-header').appendChild(btnRmLocalStorage);
            break;

        // 状态一。获取关键词对应的所有视频编号
        case State.One:
            console.log("正在获取关键词对应的所有视频编号...");

            // 一旦页面加载完毕，等待几秒后就开始获取页面上的视频编号
            console.log("确保页面真的完全加载，请等待几秒...");
            // setTimeout等待几秒，以确保网页真的已经完成加载
            // TODO: 为什么onload被触发时页面却没有加载完全？反爬虫机制？
            window.onload = setTimeout(async function () {
                console.assert(MAX_VIDEO_NUM >= 0, '最大筛选视频数量应当是非负整数，否则可能会获取不到视频编号');
                // 提取视频编号的正则表达式
                const rgx = new RegExp(
                    strFormat(String.raw`href="\/\/%s\/video\/(\d+)" class`, DOMAIN), 'g');
                let videoIdArr;
                if (hasLoggedIn(document.body)) {
                    // 如果已登录，不断下滑到页面底部，加载更多视频
                    videoIdArr = await loopForVideo(document.body, MAX_VIDEO_NUM, rgx);
                } else {
                    // 如果未登录，直接获取页面上的视频链接
                    videoIdArr = Array.from(document.body.innerHTML.matchAll(rgx), m => m[1]);
                    videoIdArr = [...new Set(videoIdArr)];
                }
                videoIdArr = videoIdArr.slice(
                    0, Math.min(videoIdArr.length, Math.floor(MAX_VIDEO_NUM)));

                console.log(strFormat('已提取和“%s”相关的所有视频编号', TARGET));
                console.log(videoIdArr);
                if (videoIdArr.length > 0) {
                    localStorage.setItem('State', String(State.Two));
                    localStorage.setItem('videoIdArr', String(videoIdArr));
                    localStorage.setItem('videoCurIndex', String(0));
                    curState = State.Two;

                    // 重定向至第0号视频页面，下次脚本应当进入下一个状态
                    // TODO: 和下一种状态耦合
                    const videoUrl = strFormat('https://%s/video/%s', DOMAIN, videoIdArr[0]);
                    window.location.href = videoUrl;
                } else {
                    // 出错，下次用户刷新后返回初态
                    console.log('没有获取到任何有效的视频编号，用户刷新后将重新运行脚本');
                    localStorage.setItem('State', String(State.Original));
                    curState = State.Original;
                }
            }, 5000);
            break;

        // 状态二。处理每个编号的视频
        case State.Two:
            console.log("正在处理每个编号的视频...");
            var videoIdArr = localStorage.getItem('videoIdArr').split(",");
            var videoCurIndex = parseInt(localStorage.getItem('videoCurIndex'));
            if (videoIdArr !== null && !isNaN(videoCurIndex)) {
                // 从上一个状态进来后，应当默认位于第0号视频处
                // TODO: 和上一种状态耦合
                console.log(strFormat(
                    "处理进度：%s / %s", videoCurIndex + 1, videoIdArr.length));
                var videoId = videoIdArr[videoCurIndex];
                console.log('进入视频：' + videoId);
                window.onload = function () {

                    // 分析视频页面，核心处理逻辑
                    const body = document.getElementsByTagName("body")[0];
                    let result = mainLogic(body, KEYWORDS);
                    console.log('本视频页面分析完成，结果为：')
                    console.log(result);
                    // 添加结果至本地缓存，若是从头开始运行则覆盖老的本地缓存
                    let oldResult = localStorage.getItem('Result');
                    if (oldResult !== null && videoCurIndex !== 0) {
                        result = oldResult + result;
                    }
                    localStorage.setItem('Result', String(result));

                    if (videoCurIndex + 1 < videoIdArr.length) {
                        // 下一次重定向时，将处理下一个视频
                        videoCurIndex++;
                        localStorage.setItem('videoCurIndex', String(videoCurIndex));
                        localStorage.setItem('State', String(State.Two));
                        curState = State.Two;

                        // 重定向至下一个视频，下次脚本应当处理下一个视频
                        videoId = videoIdArr[videoCurIndex];
                        const videoUrl = strFormat('https://%s/video/%s', DOMAIN, videoId);
                        window.location.href = videoUrl;
                    } else {
                        // 执行完毕正常退出，下次用户刷新后返回初态
                        let finMsg = strFormat(
                            '【视频主题】\n%s\n【评论关键词】\n%s\n【最终筛选结果】\n%s\n',
                            TARGET, KEYWORDS, result);
                        console.log(finMsg);
                        download(result, 'Result', 'text/plain');

                        console.log('脚本运行完成，注意结果文件下载弹窗。用户刷新后将重新运行脚本');
                        localStorage.setItem('State', String(State.Original));
                        curState = State.Original;
                    }
                }
            } else {
                // 出错，下次用户刷新后返回初态
                console.log('没有找到视频编号的缓存文件，用户刷新后将重新运行脚本');
                localStorage.setItem('State', String(State.Original));
                curState = State.Original;
            }
            break;
    }

    console.log('除了填写信息的页面外，页面如果长时间没有自动跳转，脚本可能已经停止运行\n'
        + '可以尝试刷新页面，脚本可能恢复运行。仍不行请删除浏览器上该网站的浏览缓存数据，刷新后脚本将重置。');

})();
