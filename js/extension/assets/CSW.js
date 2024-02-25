/* eslint-disable */
// REQUIREMENTS //
import { get } from 'mapstore2/web/client/libs/ajax';

// FUNCTIONS //
/**
 * CSW url request to API
 * @param {string} url
 */
const catalogURL2APIprefix = function(catalogURL) {
    var catalogURLParams = catalogURL.split('?');
    catalogURL = catalogURLParams[0].split('srv')[0];
    catalogURLParams = new URLSearchParams(catalogURLParams[1]);
    var catalogAPI = catalogURL + 'srv/api/records/'
    return {url: catalogAPI, params: catalogURLParams};
};

/**
 * getFeatureCatalogById
 * return a promise of result according to the CSW request "RecordByID"
 * the result should have a list of key-label and associated multiple choices array if exist
 * @param {string} catalogURL
 */
const getRecordFeatureCatalogById = function(catalogURL, id) {

    // return Promise
    return new Promise((resolve) => {
        resolve(getRecordById(catalogURL, id)
            .then((json) => {
                if (json) {
                    let cOC = {};
                    // if there is featureType field in the response
                    if ( json && json['gfc:featureType'] ) {
                        let FC_FeatureCatalogue = json['gfc:featureType'];
                        // is there any carrierOfCharacteristics ?
                        if (FC_FeatureCatalogue && FC_FeatureCatalogue['gfc:FC_FeatureType'] && FC_FeatureCatalogue['gfc:FC_FeatureType']['gfc:carrierOfCharacteristics'] ) {
                            let cOCElement = FC_FeatureCatalogue['gfc:FC_FeatureType']['gfc:carrierOfCharacteristics'];
                            // Loop over each attribute
                            for (let j = 0; j < cOCElement.length; j++) {
                                let elName = "FC_FeatureAttribute";
                                let finalEl = {};
                                if (cOCElement[j]['gfc:' + elName]) {
                                    let cOCel = cOCElement[j]['gfc:' + elName];
                                    finalEl = {
                                        name: cOCel['gfc:memberName']['gco:LocalName']['#text'],
                                        label: cOCel['gfc:definition']['gco:CharacterString']['#text']
                                    };
                                    // is there any listedValue ?
                                    if (cOCel['gfc:listedValue'] && Array.isArray(cOCel['gfc:listedValue'])) {
                                        finalEl.values = cOCel['gfc:listedValue'].map(value => value['gfc:FC_ListedValue']['gfc:code']['gco:CharacterString']['#text']);
                                        finalEl.labels = cOCel['gfc:listedValue'].map(value => value['gfc:FC_ListedValue']['gfc:label']['gco:CharacterString']['#text']);
                                    }
                                }
                                // Append the result
                                if (cOC[elName] && Array.isArray(cOC[elName])) {
                                    cOC[elName].push(finalEl);
                                } else if (cOC[elName]) {
                                    cOC[elName] = [cOC[elName], finalEl];
                                } else {
                                    cOC[elName] = finalEl;
                                }
                            }
                        }
                    }
                    return {cOC};
                }
                return null;
            }));
        });

}

/**
 * getRecordById
 * return a promise of result according to the CSW request "RecordByID"
 * @param {string} catalogURL
 */
const getRecordById = function(catalogURL, id, extendedParams) {
    var catalogAPI = catalogURL2APIprefix(catalogURL);
    var URL = catalogAPI.url + ( id ? id : catalogAPI.params.get('id') ) + ( extendedParams && extendedParams.related ? '/related?type=' + extendedParams.related + '&start=1' : '')
    // return Promise
    return new Promise((resolve) => {
        resolve(get(URL, {
            headers: {
                'Content-type': "application/json; charset=utf-8"
            }
          })
            .then((response) => {
                if (response) {
                    var json = response.data;

                    try {
                        if (extendedParams) {
                            if (extendedParams.related && extendedParams.related === 'children') {
                                return json.children;
                            }
                            if (extendedParams.related && extendedParams.related === 'fcats' && json.fcats) {
                                // Return list of fcats ID
                                return json.fcats.map(fcat => fcat.id);
                            } else {
                                return null;
                            }
                        }
                        return json;
                    } catch (error) {
                        return error;
                    }
                }
                return null;
            }));
    });
}

/**
 * getKeywordsFromJSON
 * extract keywords from JSON response
 * @param {*} jsonResponse
 */
const getKeywordsFromJSON = function(jsonResponse) {
    // Wich gco protocol
    if (jsonResponse && jsonResponse['@xmlns:gco']) {
        var namespaces;
        if (jsonResponse['@xmlns:gco'] === 'http://www.isotc211.org/2005/gco') {
            namespaces = ['gmd', 'gmd', 'gco'];
        } else if (jsonResponse['@xmlns:gco'] === 'http://standards.iso.org/iso/19115/-3/gco/1.0') {
            namespaces = ['mdb', 'mri', 'gco'];
        } else {
            throw new ReferenceError("OGC protocol are not configured in the extension: " + jsonResponse['@xmlns:gco'], "utils/CSW.js", 122);
        }
    } else {
        throw new ReferenceError("Cannot find '@xmlns:gco' field", "utils/CSW.js", 120);
    }

    // Extract keywords
    var keywords = [];
    if (jsonResponse[namespaces[0] + ':identificationInfo'] && jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'] && jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'][namespaces[1] + ':descriptiveKeywords']) {
        var descriptiveKeywords = jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'][namespaces[1] + ':descriptiveKeywords'];
        // Loop over each keywords
        descriptiveKeywords.forEach(function(keyword) {
            if (keyword[namespaces[1] + ':MD_Keywords'] && keyword[namespaces[1] + ':MD_Keywords'][namespaces[1] + ':keyword']) {
                var keyword = keyword[namespaces[1] + ':MD_Keywords'] && keyword[namespaces[1] + ':MD_Keywords'][namespaces[1] + ':keyword'];
                if (Array.isArray(keyword)) {
                    keyword.forEach(function(kk) {
                        if (kk[namespaces[2] + ':CharacterString']) {
                            keywords.push(kk[namespaces[2] + ':CharacterString']['#text'])
                        }
                    })
                } else {
                    if (keyword[namespaces[2] + ':CharacterString']) {
                        keywords.push(keyword[namespaces[2] + ':CharacterString']['#text'])
                    }
                }
            }
        })
    }
    return keywords;
}

/**
 * __parseProtocolAndURL private function to match protocol and url params
 * and extract name
 * @param {*} onLineResource
 * @param {*} layer
 * @param {*} namespaces
 */
const __parseProtocolAndURL = function(onLineResource, layer, namespaces) {
    if (onLineResource[namespaces[2] + ':protocol'] && onLineResource[namespaces[2] + ':protocol'][namespaces[3] + ':CharacterString']) {
        var protocol = onLineResource[namespaces[2] + ':protocol'][namespaces[3] + ':CharacterString']['#text'];
        if (!protocol.toLowerCase().includes(layer.type.toLowerCase())) {
            // Protocols are not identics
            throw new Error("Protocols are not identics", "utils/CSW.js", 168);
        }
        // URL server is the same ?
        if (onLineResource[namespaces[2] + ':linkage']) {
            // Multiple way of linkage - IMPROVE IT
            var linkage = null;
            if (onLineResource[namespaces[2] + ':linkage'][namespaces[3] + ':CharacterString']) {
                linkage = onLineResource[namespaces[2] + ':linkage'][namespaces[3] + ':CharacterString']['#text'];
            }
            if (onLineResource[namespaces[2] + ':linkage'][namespaces[2] + ':URL']) {
                linkage = onLineResource[namespaces[2] + ':linkage'][namespaces[2] + ':URL'];
            }
            if (linkage && linkage.toLowerCase().includes(layer.url.toLowerCase().split('?')[0]) && onLineResource[namespaces[2] + ':name'] && onLineResource[namespaces[2] + ':name'][namespaces[3] + ':CharacterString']) {
                return onLineResource[namespaces[2] + ':name'][namespaces[3] + ':CharacterString']['#text'];
            } else {
                throw new Error("Cannot match the URL server", "utils/CSW.js", 183);
            }
        } else {
            throw new ReferenceError("Cannot find 'linkage' field", "utils/CSW.js", 173);
        }
    } else {
        throw new ReferenceError("Cannot find 'protocol' field", "utils/CSW.js", 166);
    }
}

/**
 * __extractNameOfType private function to extract name according to the parent type layer
 * based on geonetwork protocol
 * @param {*} transferOptions
 * @param {*} layer
 * @param {*} namespaces
 */
const __extractNameOfType = function(transferOptions, layer, namespaces) {
    // Find CI Online resource
    var name = null;
    if (transferOptions[namespaces[1] + ':MD_DigitalTransferOptions'] && transferOptions[namespaces[1] + ':MD_DigitalTransferOptions'][namespaces[1] + ':onLine']) {
        var onLine = transferOptions[namespaces[1] + ':MD_DigitalTransferOptions'][namespaces[1] + ':onLine'];
        if (Array.isArray(onLine)) {
            var nboL = onLine.length;
            var countErrors = 0;
            var error;
            for (let oL of onLine) {
                try {
                    name = __parseProtocolAndURL(oL[namespaces[2] + ':CI_OnlineResource'], layer, namespaces);
                    // Stop when name protocol is founded
                    if (name) break;
                } catch (e) {
                    error = e;
                    countErrors += 1;
                }

                // Everything is an error ?
                if (countErrors == nboL) {
                    throw error;
                }
            }
        } else {
            try {
                name = __parseProtocolAndURL(onLine[namespaces[2] + ':CI_OnlineResource'], layer, namespaces);
            } catch (e) {
                throw e;
            }
        }
    } else {
        throw new ReferenceError("Cannot find 'MD_DigitalTransferOptions' or 'onLine' field", "utils/CSW.js", 206);
    }
    // Fields not found
    return name;
}

/**
 * getDistributionProtocolFromJSON
 * extract distribution protocol (WMS, WFS, etc) from JSON response
 * @param {*} jsonResponse
 * @param {*} type
 */
const getNameVSLayerFromJSON = function(jsonResponse, layer) {
    // Type is mandatory
    if (layer == undefined) throw new Error("Fonction mal appelÃ©e");;

    // Wich gco protocol
    if (jsonResponse && jsonResponse['@xmlns:gco']) {
        var namespaces;
        if (jsonResponse['@xmlns:gco'] === 'http://www.isotc211.org/2005/gco') {
            namespaces = ['gmd', 'gmd', 'gmd', 'gco'];
        } else if (jsonResponse['@xmlns:gco'] === 'http://standards.iso.org/iso/19115/-3/gco/1.0') {
            namespaces = ['mdb', 'mrd', 'cit', 'gco'];
        } else {
            throw new ReferenceError("OGC protocol are not configured in the extension: " + jsonResponse['@xmlns:gco'], "utils/CSW.js", 254);
        }
    } else {
        throw new ReferenceError("Cannot find '@xmlns:gco' field", "utils/CSW.js", 252);
    }

    // Extract name
    var name = null;
    if (jsonResponse[namespaces[0] + ':distributionInfo'] && jsonResponse[namespaces[0] + ':distributionInfo'][namespaces[1] + ':MD_Distribution'] && jsonResponse[namespaces[0] + ':distributionInfo'][namespaces[1] + ':MD_Distribution'][namespaces[1] + ':transferOptions']) {
        var transferOptions = jsonResponse[namespaces[0] + ':distributionInfo'][namespaces[1] + ':MD_Distribution'][namespaces[1] + ':transferOptions'];
        // Can be an Array
        if (Array.isArray(transferOptions)) {
            var nbtO = transferOptions.length;
            var countErrors = 0;
            var error;
            for (let tO of transferOptions) {
                try {
                    name = __extractNameOfType(tO, layer, namespaces);
                    // Stop when name protocol is founded
                    if (name) break;
                } catch (e) {
                    error = e;
                    countErrors += 1;
                }

                // Everything is an error ?
                if (countErrors == nbtO) throw error;
            }
        } else {
            try {
                name = __extractNameOfType(transferOptions, layer, namespaces);
            } catch (e) {
                throw e;
            }
        }
    }
    return name;
}

/**
 * getTitleLayerFromJSON
 * extract title from JSON response
 * @param {*} jsonResponse
 * @param {*} type
 */
const getTitleLayerFromJSON = function(jsonResponse) {
    // Wich gco protocol
    if (jsonResponse && jsonResponse['@xmlns:gco']) {
        var namespaces;
        if (jsonResponse['@xmlns:gco'] === 'http://www.isotc211.org/2005/gco') {
            namespaces = ['gmd', 'gmd', 'cit', 'gco'];
        } else if (jsonResponse['@xmlns:gco'] === 'http://standards.iso.org/iso/19115/-3/gco/1.0') {
            namespaces = ['mdb', 'mri', 'cit', 'gco'];
        } else {
            throw new ReferenceError("OGC protocol are not configured in the extension: " + jsonResponse['@xmlns:gco'], "utils/CSW.js", 308);
        }
    } else {
        throw new ReferenceError("Cannot find '@xmlns:gco' field", "utils/CSW.js", 306);
    }

    // Extract title
    if (jsonResponse[namespaces[0] + ':identificationInfo'] && jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'] && jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'][namespaces[1] + ':citation']) {
        var citation = jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'][namespaces[1] + ':citation'];
        if (citation[namespaces[2] + ':CI_Citation'] && citation[namespaces[2] + ':CI_Citation'][namespaces[2] + ':title'] && citation[namespaces[2] + ':CI_Citation'][namespaces[2] + ':title'][namespaces[3] + ':CharacterString']) {
            return citation[namespaces[2] + ':CI_Citation'][namespaces[2] + ':title'][namespaces[3] + ':CharacterString']['#text'];
        } else {
            throw new ReferenceError("Cannot find 'CharacterString' field", "utils/CSW.js", 323);
        }
    } else {
        throw new ReferenceError("Cannot find 'citation' field", "utils/CSW.js", 321);
    }
}

/**
 * getDefinitionLayerFromJSON
 * extract title from JSON response
 * @param {*} jsonResponse
 * @param {*} type
 */
const getDefinitionLayerFromJSON = function(jsonResponse) {
    // Wich gco protocol
    if (jsonResponse && jsonResponse['@xmlns:gco']) {
        var namespaces;
        if (jsonResponse['@xmlns:gco'] === 'http://www.isotc211.org/2005/gco') {
            namespaces = ['gmd', 'gmd', 'cit', 'gco'];
        } else if (jsonResponse['@xmlns:gco'] === 'http://standards.iso.org/iso/19115/-3/gco/1.0') {
            namespaces = ['mdb', 'mri', 'cit', 'gco'];
        } else {
            throw new ReferenceError("OGC protocol are not configured in the extension: " + jsonResponse['@xmlns:gco'], "utils/CSW.js", 308);
        }
    } else {
        throw new ReferenceError("Cannot find '@xmlns:gco' field", "utils/CSW.js", 306);
    }

    // Extract title
    if (jsonResponse[namespaces[0] + ':identificationInfo'] && jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'] && jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'][namespaces[1] + ':abstract']) {
        var abstract = jsonResponse[namespaces[0] + ':identificationInfo'][namespaces[1] + ':MD_DataIdentification'][namespaces[1] + ':abstract'];
        if (abstract[namespaces[3] + ':CharacterString']) {
            return abstract[namespaces[3] + ':CharacterString']['#text'];
        } else {
            throw new ReferenceError("Cannot find 'CharacterString' field", "utils/CSW.js", 356);
        }
    } else {
        throw new ReferenceError("Cannot find 'abstract' field", "utils/CSW.js", 354);
    }
}

/**
 * API for local config
 */
var Api = {
    getRecordById,
    getRecordFeatureCatalogById,
    getKeywordsFromJSON,
    getNameVSLayerFromJSON,
    getTitleLayerFromJSON,
    getDefinitionLayerFromJSON
};

export default Api;
