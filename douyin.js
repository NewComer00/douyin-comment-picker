// ==UserScript==
// @name         抖音评论筛选器 | Douyin Comment Picker
// @namespace    https://github.com/NewComer00
// @version      0.1.1
// @description  筛选包含给定关键词的抖音评论 | Pick out the comments including the given keywords in Douyin.
// @author       NewComer00
// @match        https://www.douyin.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/js-cookie@3.0.1/dist/js.cookie.min.js
// @license      GPLv2 AND Commercial use prohibited | GPLv2且禁止商用
// ==/UserScript==

(function () {
    'use strict';

    // ========================================================================
    // 使用说明
    //
    // v0.1.1
    // 在Tampermonkey中修改“脚本输入参数”，Ctrl+S保存修改。
    // 使能该脚本，然后访问抖音官网，按下F12进入Console即可。
    // 脚本运行中如被打断，刷新即可继续运行。脚本的Cookie文件会保存一天时间。一天之内都可以再次从断点开始。
    // 如中途需要从头执行脚本，请先删除浏览器Cookie，然后刷新抖音页面即可。
    // 执行完毕后，网页会弹出结果文件下载窗口。复制文件中所有内容，粘贴到Excel即可以表格方式查看。
    // ========================================================================

    // ========================================================================
    // 脚本输入参数
    // ========================================================================

    // 网站域名。目前只适用于抖音
    const DOMAIN = 'www.douyin.com';

    // 视频关键词
    const TARGET = '孙一峰';

    // 视频下的评论关键词
    const KEYWORDS = ['ToSsGirL', '西湖', '大哥', 'F91'];

    // 只筛选前几个视频，应当是非负整数
    const MAX_VIDEO_NUM = 5;

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
    let curState = Cookies.get('State');
    if (typeof curState === 'undefined') {
        Cookies.set('State', State.Original, { domain: DOMAIN, expires: 1 });
        curState = State.Original;
    }

    switch (curState) {
        // 初态。根据关键词搜索视频
        case State.Original:
            console.log("正在根据关键词搜索视频...");
            Cookies.set('State', String(State.One), { domain: DOMAIN, expires: 1 });
            curState = State.One;

            // 重定向至视频搜索结果页面
            var searchUrl = encodeURI(strFormat('https://%s/search/%s?&type=video', DOMAIN, TARGET));
            window.location.href = searchUrl;
            break;

        // 状态一。获取关键词对应的所有视频编号
        case State.One:
            console.log("正在获取关键词对应的所有视频编号...");
            // setTimeout等待几秒，以确保网页真的已经完成加载
            // TODO: 为什么onload被触发时页面却没有加载完全？反爬虫机制？
            console.log("确保页面真的完全加载，请等待几秒...");
            window.onload = setTimeout(function () {
                const bodyText = document.getElementsByTagName("body")[0].innerHTML;
                const rgx = new RegExp(
                    strFormat(String.raw`href="\/\/%s\/video\/(\d+)" class`, DOMAIN), 'g');
                let videoIdArr = Array.from(bodyText.matchAll(rgx), m => m[1]);
                // 去除重复的视频编号
                videoIdArr = [...new Set(videoIdArr)];
                // 用户希望选择前多少个视频
                console.assert(MAX_VIDEO_NUM >= 0, 'MAX_VIDEO_NUM应当是非负整数，否则可能会获取不到视频编号');
                videoIdArr = videoIdArr.slice(
                    0, Math.min(videoIdArr.length, Math.floor(MAX_VIDEO_NUM)));

                console.log(strFormat('已提取和“%s”相关的所有视频编号', TARGET));
                console.log(videoIdArr);
                if (videoIdArr.length > 0) {
                    Cookies.set('State', String(State.Two), { domain: DOMAIN, expires: 1 });
                    Cookies.set('videoIdArr', String(videoIdArr), { domain: DOMAIN, expires: 1 });
                    Cookies.set('videoCurIndex', String(0), { domain: DOMAIN, expires: 1 });
                    curState = State.Two;

                    // 重定向至第0号视频页面，下次脚本应当进入下一个状态
                    // TODO: 和下一种状态耦合
                    const videoUrl = strFormat('https://%s/video/%s', DOMAIN, videoIdArr[0]);
                    window.location.href = videoUrl;
                } else {
                    // 出错，下次刷新后返回初态
                    console.log('没有获取到任何有效的视频编号，刷新后将重新运行脚本');
                    Cookies.set('State', String(State.Original), { domain: DOMAIN, expires: 1 });
                    curState = State.Original;
                }
            }, 5000);
            break;

        // 状态二。处理每个编号的视频
        case State.Two:
            console.log("正在处理每个编号的视频...");
            var videoIdArr = Cookies.get('videoIdArr').split(",");
            var videoCurIndex = parseInt(Cookies.get('videoCurIndex'));
            if (typeof videoIdArr !== 'undefined' && !isNaN(videoCurIndex)) {
                // 从上一个状态进来后，应当默认位于第0号视频处
                // TODO: 和上一种状态耦合
                var videoId = videoIdArr[videoCurIndex];
                console.log('进入视频：' + videoId);
                window.onload = function () {

                    // 分析视频页面，核心处理逻辑
                    const body = document.getElementsByTagName("body")[0];
                    let result = mainLogic(body, KEYWORDS);
                    console.log('本视频页面分析完成，结果为：')
                    console.log(result);
                    // 添加结果至缓存，若是从头开始运行则覆盖老的缓存
                    let oldResult = Cookies.get('Result');
                    if (typeof oldResult !== 'undefined' && videoCurIndex !== 0) {
                        result = oldResult + result;
                    }
                    Cookies.set('Result', String(result), { domain: DOMAIN, expires: 1 });

                    if (videoCurIndex + 1 < videoIdArr.length) {
                        // 下一次重定向时，将处理下一个视频
                        videoCurIndex++;
                        Cookies.set('videoCurIndex', String(videoCurIndex), { domain: DOMAIN, expires: 1 });
                        Cookies.set('State', String(State.Two), { domain: DOMAIN, expires: 1 });
                        curState = State.Two;

                        // 重定向至下一个视频，下次脚本应当处理下一个视频
                        videoId = videoIdArr[videoCurIndex];
                        const videoUrl = strFormat('https://%s/video/%s', DOMAIN, videoId);
                        window.location.href = videoUrl;
                    } else {
                        // 执行完毕正常退出，下次刷新后返回初态
                        let finMsg = strFormat(
                            '【视频主题】\n%s\n【评论关键词】\n%s\n【最终筛选结果】\n%s\n',
                            TARGET, KEYWORDS, result);
                        console.log(finMsg);
                        download(result, 'Result', 'text/plain');

                        console.log('脚本运行完成，注意结果文件下载弹窗。刷新后将重新运行脚本');
                        Cookies.set('State', String(State.Original), { domain: DOMAIN, expires: 1 });
                        curState = State.Original;
                    }
                }
            } else {
                // 出错，下次刷新后返回初态
                console.log('没有找到视频编号缓存文件，刷新后将重新运行脚本');
                Cookies.set('State', String(State.Original), { domain: DOMAIN, expires: 1 });
                curState = State.Original;
            }
            break;
    }

    console.log('页面如果长时间没有自动跳转，脚本可能已经停止运行\n'
        + '可以尝试刷新页面，或删除Cookie后再刷新页面，脚本可能恢复运行');

})();
