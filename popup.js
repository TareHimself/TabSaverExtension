async function createTabAndGetId(url, windowId) {
	return (await chrome.tabs.create({ url: url, windowId: windowId })).id;
}


async function createWindow({ incognito, groups }) {
	const urlsToCreateWith = groups['none|-1'] || [];

	const newWindow = await chrome.windows.create({ incognito: incognito, url: urlsToCreateWith });

	const groupsList = Object.keys(groups).filter(group => group !== 'none|-1');
	for (let i = 0; i < groupsList.length; i++) {
		const currentGroup = groups[groupsList[i]];

		const ids = (await Promise.allSettled(currentGroup.map(url => createTabAndGetId(url, newWindow.id)))).map(promise => promise.value);

		const newGroupId = await chrome.tabs.group({ createProperties: { windowId: newWindow.id }, tabIds: ids });

		console.log(groupsList[i]);

		await chrome.tabGroups.update(newGroupId, { title: groupsList[i].split('|')[0] });

	}
}

async function onButtonClicked(event) {

	const id = event.target.getAttribute('data-session-id');
	const op = event.target.getAttribute('data-op');

	if (op === 'l') {
		const JsonItem = JSON.parse((await chrome.storage.sync.get(id))[id])
		createWindow(JsonItem);
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
			groupIdLookup[groupId] = `none|${groupId}`;
		}
		else {
			groupIdLookup[groupId] = `${(await chrome.tabGroups.get(groupId)).title}|${groupId}`;
		}
	}

	return tabs.map((tab) => {
		return { url: tab.url, groupId: tab.groupId }
	}).reduce((data, tab) => {

		if (!data.groups[groupIdLookup[tab.groupId]]) data.groups[groupIdLookup[tab.groupId]] = [];

		data.groups[groupIdLookup[tab.groupId]].push(tab.url);

		return data;
	}, { groups: {}, incognito: currentWindow.incognito })
}

async function onSaveWindowClicked() {
	try {
		const result = await tabsToJson();

		const currentDate = new Date();

		const nameToSaveAs = document.getElementById('save-session-text').value || currentDate.toLocaleString();

		const itemToSave = {};

		itemToSave[nameToSaveAs] = JSON.stringify(result);

		await chrome.storage.sync.set(itemToSave);

		await generateSavedList();
	} catch (error) {
		alert(error.message)
	}

}

async function generateDownloadLink() {
	const tabsStringified = JSON.stringify(await tabsToJson(), null, 4); //indentation in json format, human readable

	const vBlob = new Blob([tabsStringified], { type: "octet/stream" });

	const downloadButton = document.getElementById('export-session-button')

	downloadButton.setAttribute('href', window.URL.createObjectURL(vBlob));
	downloadButton.setAttribute('download', 'tabs.json');

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

