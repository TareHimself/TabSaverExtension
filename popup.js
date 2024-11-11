async function createTabAndGetId(url, windowId) {
	return (await chrome.tabs.create({ url: url, windowId: windowId })).id;
}


async function createWindow(data) {
	const incognito = data.shift()



	let currentGroupId = "NOGROUP"
	let groups = {}
	data.forEach((d) => {
		if (d.startsWith('[') && d.endsWith(']')) {
			currentGroupId = d.slice(1, -1)

			groups[currentGroupId] = []
		}
		else {
			groups[currentGroupId].push(d)
		}
	})

	const newWindow = await chrome.windows.create({ incognito: incognito === 'true', url: groups["NOGROUP"] || [] });

	delete groups["NOGROUP"]

	Object.keys(groups).forEach(async (groupId) => {


		const ids = (await Promise.allSettled(groups[groupId].map(url => createTabAndGetId(url, newWindow.id)))).map(promise => promise.value)

		const newGroupId = await chrome.tabs.group({ createProperties: { windowId: newWindow.id }, tabIds: ids });

		await chrome.tabGroups.update(newGroupId, { title: groupId.split('|')[0] });
	})
}

async function onButtonClicked(event) {

	const id = event.target.getAttribute('data-session-id');
	const op = event.target.getAttribute('data-op');

	if (op === 'l') {
		createWindow((await chrome.storage.sync.get([id]))[id].split('\n'));
	} else if (op === 'd') {
		await chrome.storage.sync.remove(id);
	}

	generateSavedList();
}

async function generateSavedList() {
	const items = await chrome.storage.sync.get();

	document.getElementById('saved-sessions').innerHTML = Object.keys(items).reduce((newString, current) => {
		newString += createSavedSessionItem(current);
		return newString;
	}, '');

	document.querySelectorAll('.saved-session-item-button').forEach((b) => {
		b.addEventListener('click', onButtonClicked);
	});
}

function createSavedSessionItem(id) {
	return `<div class="saved-session-item">
      <h3>${id}</h3>
      <span>
        <button data-session-id="${id}" data-op="l" class="saved-session-item-button">Load</button>
        <button data-session-id="${id}" data-op="d" class="saved-session-item-button">Delete</button>
      </span>
    </div>`
}

async function tabsToJson() {
	const currentWindow = await chrome.windows.getCurrent();

	const tabs = (await chrome.tabs.query({})).sort((a, b) => {
		return a.index - b.index;
	}).filter(tab => tab.windowId === currentWindow.id);

	const groupIdLookup = {}

	const groups = tabs.reduce((groupIds, tab) => {
		if (!groupIds.includes(tab.groupId)) groupIds.push(tab.groupId);

		return groupIds;
	}, []);

	for (let i = 0; i < groups.length; i++) {
		const groupId = groups[i];
		if (groupId < 0) {
			groupIdLookup[groupId] = `NOGROUP`;
		}
		else {
			groupIdLookup[groupId] = `${(await chrome.tabGroups.get(groupId)).title}|${groupId}`;
		}
	}

	const groupedUrls = tabs.map((tab) => {
		return { url: tab.url, groupId: tab.groupId }
	}).reduce((data, tab) => {
		if (!data[groupIdLookup[tab.groupId]]) data[groupIdLookup[tab.groupId]] = [];

		data[groupIdLookup[tab.groupId]].push(tab.url);

		return data;
	}, {})

	const finalData = [`${currentWindow.incognito}`]

	Object.keys(groupedUrls).forEach((groupId) => {
		finalData.push(`[${groupId}]`)
		groupedUrls[groupId].forEach((url) => {
			finalData.push(`${url}`)
		})
	})

	return finalData
}

async function onSaveWindowClicked() {
	try {
		const nameToSaveAs = document.getElementById('save-session-text').value || (new Date()).toLocaleString();

		const result = await tabsToJson();

		const itemToSave = {};

		await chrome.storage.sync.set({ [nameToSaveAs]: result.join('\n') });

		await generateSavedList();
	} catch (error) {
		alert(error.message)
	}

}

async function generateDownloadLink() {
	const tabsStringified = (await tabsToJson()).join('\n'); //indentation in json format, human readable

	const vBlob = new Blob([tabsStringified], { type: "octet/stream" });

	const downloadButton = document.getElementById('export-session-button')

	downloadButton.setAttribute('href', window.URL.createObjectURL(vBlob));
	downloadButton.setAttribute('download', 'tabs.txt');

}

async function onTabsImported(e) {
	const files = e.target.files, reader = new FileReader();
	console.log(files[0])
	reader.onload = () => {
		try {
			const importedData = JSON.parse(reader.result);
			createWindow(importedData)
		} catch (error) {
			alert(error.message)
		}
		document.getElementById('import-session-button').value = '';
	};
	reader.readAsText(files[0]);
}

document.getElementById('save-session-button').addEventListener("click", onSaveWindowClicked)

document.getElementById('import-session-button').addEventListener("change", onTabsImported, false);

generateSavedList();

generateDownloadLink();

