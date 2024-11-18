/* eslint-disable */
/* REQUIREMENTS */
import * as Rx from 'rxjs';
import axios from 'axios';
const assign = require('object-assign');
// ACTIONS
import { loadedData, loadError, updateStyleMillesimeBtn, GET_MILLESIME_LAYERS, getMillesimeLayers, SET_MILLESIME_SELECTED, setParentSelected } from './actions';
const { FEATURE_TYPE_LOADED, resetQuery } = require('mapstore2/web/client/actions/wfsquery');
const { ADD_LAYER, REMOVE_NODE, changeLayerProperties, browseData } = require('mapstore2/web/client/actions/layers');
const { MAP_CONFIG_LOADED } = require('mapstore2/web/client/actions/config');
import { UPDATE_MAP_LAYOUT } from 'mapstore2/web/client/actions/maplayout';
import { clickOnMap } from 'mapstore2/web/client/actions/map';
import { findGeometryProperty } from 'mapstore2/web/client/utils/ogc/WFS/base';
import { TOGGLE_MODE, CREATE_NEW_FEATURE, featureModified, updateFilter, customizeAttribute, updateCustomEditorsOptions, setSelectionOptions } from 'mapstore2/web/client/actions/featuregrid';
// SELECTORS
import { clickPointSelector, mapInfoRequestsSelector } from 'mapstore2/web/client/selectors/mapInfo';
const { typeNameSelector, describeSelector, resultsSelector } = require('mapstore2/web/client/selectors/query');
import {layersSelector, getLayerFromId} from 'mapstore2/web/client/selectors/layers';
import { userSelector } from 'mapstore2/web/client/selectors/security';
import { isFeatureGridOpen } from 'mapstore2/web/client/selectors/featuregrid';
// UTILS
const { find, get, cloneDeep } = require("lodash");
import API from '../assets/CSW';

/* PRIVATE FUNCTIONS */
/**
 * find the cfg key of the plugin
 */
const getCFGGeonetwork = (key) => {
    var geonetworkCFG = document.querySelector('#geonetworkCFG');
    if (geonetworkCFG) {
        var tt = geonetworkCFG.getAttribute(key);
        if (['true', 'false'].indexOf(tt.toLowerCase()) > -1) tt = !!JSON.parse(String(tt).toLowerCase());
        return tt;
    }
    return null;
}

/**
 * return the organisme value from the html string
 * @param {string} data
 */
const getOrganismeUser = (data) => {
    var parser = new DOMParser();
    var htmlDoc = parser.parseFromString(data, "text/html");
    var scripts = htmlDoc.querySelectorAll('script');
    var scriptHTML;
    // Loop over each script balise to find the one containing "org"
    for (var ii in scripts) {
        if (scripts[ii] && scripts[ii].innerHTML) {
            if (scripts[ii].innerHTML.startsWith('var org = {')) {
                scriptHTML = scripts[ii].innerHTML;
                break;
            }
        }
    }
    // Parsing the innerHTML
    var org = scriptHTML.split('};')[0] + '}';
    var idStart = org.indexOf('{');
    org = JSON.parse(org.slice(idStart));
    return org;
}

/**
 * return the erro from request geonetwork
 * @param {string} data
 */
const getGeoNetworkERROR = (data) => {
    var parser = new DOMParser();
    var htmlDoc = parser.parseFromString(data, "text/html");
    var error = htmlDoc.querySelector('.lead');
    if (error) {
        return error.innerHTML;
    }
    return null;
}

/* EPICS HOOKS */
const loadFeatureAttributeEpic = (action$, store) => {
    // on each FEATURE_TYPE_LOADED action triggered
    return action$.ofType(FEATURE_TYPE_LOADED)
        .switchMap((action) => {
            // Epic enabled ?
            if (!getCFGGeonetwork('translateAttributes')) {
                return Rx.Observable.empty();
            }

            // Get catalogURL
            const state = store.getState();
            var layer = find(state.layers.flat, {id: state.layers.selected[0]});
            if (layer.catalogURL || (layer.extendedParams && layer.extendedParams.annexeCatalogURL)) {
                // Check if there is other catalog (childrens, etc) ORDER is important, be sure to have the master catalogURL at the end
                var catalogURLS = [];
                if (layer.extendedParams && layer.extendedParams.annexeCatalogURL) {
                    catalogURLS.push(layer.extendedParams.annexeCatalogURL);
                }
                if (layer.catalogURL) catalogURLS.push(layer.catalogURL);
                // Get Feature catalog ID from Parent
                return Rx.Observable.defer(() => axios.all(catalogURLS.map(catalogURL => API.getRecordById(catalogURL, undefined, { related: 'fcats' }))))
                    .switchMap(function(fCatsIDMatrix) {
                        if (fCatsIDMatrix) {
                            // Split the matrix into a single array
                            var fCatsID = [];
                            var extendedCatalogURLS = [];
                            fCatsIDMatrix.forEach(function(ids, ii) {
                                if(ids != null){
                                    fCatsID = fCatsID.concat(ids);
                                    extendedCatalogURLS = extendedCatalogURLS.concat(Array.from(new Array(ids.length), x => catalogURLS[ii]));
                                }
                            })
                            // Get attributes with id related
                            return Rx.Observable.defer(() => axios.all(fCatsID.map((id, index) => API.getRecordFeatureCatalogById(extendedCatalogURLS[index], id))))
                                .switchMap(function(responses) {
                                    if (responses) {
                                        // Loop over each response (order is important)
                                        // List of actions to return
                                        var actions = [];
                                        responses.forEach(function(response, iresponse) {
                                            if (response.cOC && response.cOC.FC_FeatureAttribute) {
                                                var fca = response.cOC.FC_FeatureAttribute;
                                                // Loop over each feature attributes
                                                for (var i = 0; i < fca.length; i++) {
                                                    // Add label
                                                    actions.push(customizeAttribute(fca[i].name.toLowerCase(), 'label', fca[i].label));
                                                    // Check if there is a list of multiple choices
                                                    if (fca[i].values && getCFGGeonetwork('multiChoicesEditor')) {
                                                        var customEditorsOptions = get(state, "featuregrid.customEditorsOptions");
                                                        if (!customEditorsOptions) {
                                                            customEditorsOptions = {
                                                                'rules': []
                                                            };
                                                        }
                                                        var labels = [];
                                                        fca[i].values.forEach(function(value, id) {
                                                            labels.push(value + ' ( ' + fca[i].labels[id] + ' )');
                                                        });
                                                        // Rules already exist
                                                        var existingRules = find(customEditorsOptions.rules.regexp, {attribute: fca[i].name.toLowerCase()})
                                                        if (existingRules) {
                                                            existingRules.editorProps.values = fca[i].values;
                                                            existingRules.editorProps.labels = labels;
                                                            existingRules.editorProps.defaultOption = fca[i].values[0];
                                                        } else {
                                                            customEditorsOptions.rules.push({
                                                                "regex": {
                                                                    "attribute": fca[i].name.toLowerCase(),
                                                                    "typeName": typeNameSelector(state)
                                                                },
                                                                "editor": "DropDownEditor",
                                                                "editorProps": {
                                                                    "values": fca[i].values,
                                                                    "labels": labels,
                                                                    "forceSelection": true,
                                                                    "defaultOption": fca[i].values[0],
                                                                    "allowEmpty": false
                                                                }
                                                            });
                                                        }
                                                        // Add multiple choices as customeditorsoptions
                                                        actions.push(updateCustomEditorsOptions(customEditorsOptions));
                                                    }
                                                }
                                            }
                                        });
                                        // Trigger actions
                                        return Rx.Observable.from(actions);
                                    }
                                    return Rx.Observable.of(loadedData('No csw catalog attributes found'));
                                })
                                .catch(function(e) {
                                    console.log(e);
                                    return Rx.Observable.of(loadError(e.message));
                                });
                        }
                        return Rx.Observable.empty();
                    })
                    .catch(function(e) {
                        console.log(e);
                        return Rx.Observable.of(loadError(e.message));
                    });
            }
            return Rx.Observable.of(loadedData('No csw feature catalog found'));
        });
};

const toggleDisplayColumnOrganismeEpic = (action$, store) => {
    // on each TOGGLE_MODE action triggered
    return action$.ofType(TOGGLE_MODE)
        .switchMap((action) => {
            // Epic enabled ?
            if (!getCFGGeonetwork('organismeFilter')) {
                return Rx.Observable.empty();
            }

            const state = store.getState();
            // Warning - Changing selector will directly update state -> need refresh element (not specialy trigger actions)
            var features = resultsSelector(state);
            var describeFeatureType = describeSelector(state);
            const user = userSelector(state);
            var colOrganisme = getCFGGeonetwork('colOrganisme');
            if (colOrganisme) {
                // Get organisme of the user
                return Rx.Observable.defer(() => axios.get('/console/account/userdetails'))
                    .switchMap(function(response) {
                        // Response is an html string
                        // Need to parse it to acess to the organisme value
                        try {
                            var org = getOrganismeUser(response.data);
                        } catch (error) {
                            console.log(error)
                            return Rx.Observable.of(loadError(error));
                        }
                        if ( features && find(describeFeatureType.featureTypes[0].properties, {name: colOrganisme}) && org) {
                            // If EDIT add colOrganisme filtering else remove it
                            if (action.mode === 'EDIT') {
                                var update = {
                                    rawValue: org.shortName,
                                    value: org.shortName,
                                    operator: "ilike",
                                    type: "string",
                                    attribute: colOrganisme
                                }
                            } else if (action.mode === 'VIEW') {
                                var update = {
                                    rawValue: "",
                                    operator: "ilike",
                                    type: "string",
                                    attribute: colOrganisme
                                }
                            }
                            // TODO: Trouver une manière plus propre d'appliquer le filtre sur l'organisme en mode "édition"
                            // Voir featureGridChangePage dans epics/featuregrid.js qui surcharge les filtres.
                            // Scénario idéal: multiselect -> false, updateFilter(), multiselect -> true séquentiellement
                            const resetGeomFilter = updateFilter({
                                attribute: findGeometryProperty(describeSelector(store.getState()))?.name,
                                enabled: false,
                                type: "geometry"
                            });
                            return Rx.Observable.of(
                                resetGeomFilter,
                                updateFilter(update),
                                setSelectionOptions({multiselect: true})
                            );
                        }
                        return Rx.Observable.empty();
                    })
                    .catch(function(e) {
                        console.log(e);
                        return Rx.Observable.of(loadError(e.message))
                    });
            }
            return Rx.Observable.of(loadedData('No column Organisme founded'))
        });
};

const editNewFeatureOrganisme = (action$, store) => {
    // on each CREATE_NEW_FEATURE action triggered
    return action$.ofType(CREATE_NEW_FEATURE)
        .switchMap((action) => {
            // Epic enabled ?
            if (!getCFGGeonetwork('organismeFilter')) {
                return Rx.Observable.empty();
            }

            // Access to different state values
            const state = store.getState();
            const user = userSelector(state);
            var describeFeatureType = describeSelector(state);
            var features = resultsSelector(state);
            var colOrganisme = getCFGGeonetwork('colOrganisme');
            if (colOrganisme) {
                // Get organisme
                return Rx.Observable.defer(() => axios.get('/console/account/userdetails'))
                    .switchMap(function(response) {
                        // Response is an html string
                        // Need to parse it to acess to the organisme value
                        try {
                            var org = getOrganismeUser(response.data);
                        } catch (error) {
                            console.log(error)
                            return Rx.Observable.of(loadError(error));
                        }

                        if ( features && find(describeFeatureType.featureTypes[0].properties, {name: colOrganisme}) && org) {
                            var updated = {};
                            updated[colOrganisme] = org.shortName;
                            return Rx.Observable.of(featureModified(state.featuregrid.newFeatures, updated));
                        }

                        return Rx.Observable.empty();

                    })
                    .catch(function(e) {
                        console.log(e);
                        return Rx.Observable.of(loadError(e.message))
                    });
            }

            return Rx.Observable.of(loadedData('No column Organisme founded'))
        });
};

const updateMillesimeButtonPosition = (action$, store) => {
    // on each CREATE_NEW_FEATURE action triggered
    return action$.ofType(UPDATE_MAP_LAYOUT)
        .switchMap((action) => {
            var leftRef = 52
            // Manage TOC display
            if (action.layout.left != 0) {
                leftRef = 5
            }
            if (getCFGGeonetwork('verbose')) {
                console.group('| GeoNetworkPlugin | updateMillesimeButtonPosition')
                console.groupEnd()
            }

            return Rx.Observable.of(updateStyleMillesimeBtn({left: leftRef + action.layout.left}))
        });
};

const onAddLayerFindMillesime = (action$, store) => {
    // on each CREATE_NEW_FEATURE action triggered
    return action$.ofType(ADD_LAYER)
        .switchMap((action) => {
            // Epic enabled ?
            if (!getCFGGeonetwork('millesimeLayers')) {
                return Rx.Observable.empty();
            }
            const state = store.getState();
            if (getCFGGeonetwork('verbose')) {
                console.group('| GeoNetworkPlugin | onAddLayerFindMillesime')
                console.log('init layer state ->')
                console.dir(cloneDeep(action.layer))
                console.groupEnd()
            }
            // Check if catalogURL exist (means CSW)
            var catalogURL = find(state.layers.flat, {id: action.layer.id}).catalogURL;
            if (catalogURL) {
                // Need first millesimeManagement to have no conflict with other plugins
                return Rx.Observable.of(
                    changeLayerProperties(action.layer.id, {
                        extendedParams: action.layer.extendedParams ? assign(action.layer.extendedParams, {millesimeManagement: undefined}) : {millesimeManagement: undefined}
                    }),
                    getMillesimeLayers(action.layer.id)
                );
            }
            return Rx.Observable.empty();
        });
};

const onGetMillesimesLayers = (action$, store) => {
    // on each CREATE_NEW_FEATURE action triggered
    return action$.ofType(GET_MILLESIME_LAYERS)
        .mergeMap((action) => {
            const state = store.getState();
            // Check if layer is from CSW catalog
            var layer = getLayerFromId(state, action.id);
            var catalogURL = layer.catalogURL;
            if (getCFGGeonetwork('verbose')) {
                console.group('| GeoNetworkPlugin | onGetMillesimesLayers')
                console.log('init layer state ->')
                console.dir(cloneDeep(layer))
            }
            if (catalogURL) {
                // Get all childrens
                return Rx.Observable.defer(() => API.getRecordById(catalogURL, undefined, { related: 'children' }))
                    .switchMap(function(childrens) {
                        // Current layer has MillesimeManagement ?
                        var millesimeManagement = layer.extendedParams && layer.extendedParams.millesimeManagement;
                        if (childrens) {
                            if (getCFGGeonetwork('verbose')) {
                                console.group('Parse Childrens')
                            }
                            // Filter children by millesime tags
                            var requests = [];
                            var childrensToKeep = [];
                            childrens.forEach(function(children) {
                                if (children.id) {
                                    requests.push(API.getRecordById(catalogURL, children.id))
                                    childrensToKeep.push(children);
                                }
                            })
                            return Rx.Observable.defer(() => axios.all(requests))
                                .switchMap(function(responses) {
                                    if (responses) {
                                        var millesimeLayersList = [];
                                        var matches = getCFGGeonetwork('millesimeKeywords').split(',');
                                        // Loop over each results
                                        responses.forEach(function(response, iresponse) {
                                            // Get keywords
                                            var keywords = API.getKeywordsFromJSON(response);
                                            // Check if the layer is a millesime one
                                            keywords.forEach(function(keyword) {
                                                var boolOk = true;
                                                // TODO: strip accent "millï¿½sime"
                                                if (matches.indexOf(keyword) > -1) {
                                                    // TODO : verification is it the real match
                                                    childrensToKeep[iresponse]['record'] = response;
                                                    // Check if the millesime has a distribution protocol
                                                    try {
                                                        name = API.getNameVSLayerFromJSON(response, layer);
                                                    } catch (e) {
                                                        // Let display all millesime with different protocol or URL doesn't match
                                                        if ([183, 168].indexOf(e.lineNumber) === -1) {
                                                            boolOk = false;
                                                            console.log(e)
                                                        }
                                                    }

                                                    // Push millesimes
                                                    if (boolOk) millesimeLayersList.push(childrensToKeep[iresponse]);
                                                }
                                            })
                                        })
                                        // Founded millesimeLayers
                                        if (millesimeLayersList.length > 0) {
                                            // Check if millesimeManagement exist already
                                            var millesimeManagement = {
                                                layersList: millesimeLayersList,
                                                currentMillesime: null,
                                                parentMillesime: {
                                                    id: action.id,
                                                    name: layer.name
                                                }
                                            };
                                            // Override
                                            if (layer.extendedParams && layer.extendedParams.millesimeManagement) {
                                                millesimeManagement = layer.extendedParams.millesimeManagement;
                                                millesimeManagement.layersList = millesimeLayersList;
                                                // Check currentMillesime activated
                                                if (millesimeManagement.currentMillesime) {
                                                    // Check currentMillesime match
                                                    if (!find(millesimeManagement.layersList, {id: millesimeManagement.currentMillesime})) {
                                                        // Reset (should reset parent)
                                                        millesimeManagement.currentMillesime = null;
                                                        if (getCFGGeonetwork('verbose')) {
                                                            console.log('Add MillesimeManagement to layer')
                                                            console.log('new layer properties ->')
                                                            console.dir(cloneDeep(millesimeManagement))
                                                            console.groupEnd()
                                                            console.groupEnd()
                                                        }
                                                        return Rx.Observable.of(changeLayerProperties(action.id, {
                                                            extendedParams: assign(layer.extendedParams, { millesimeManagement: millesimeManagement }),
                                                            name: millesimeManagement.parentMillesime.name
                                                        }));
                                                    }
                                                }
                                            }
                                            if (getCFGGeonetwork('verbose')) {
                                                console.log('Add MillesimeManagement to layer')
                                                console.log('new layer properties ->')
                                                console.dir(cloneDeep(millesimeManagement))
                                                console.dir(cloneDeep(layer))
                                                console.dir(cloneDeep(getLayerFromId(state, action.id)))
                                                console.groupEnd()
                                                console.groupEnd()
                                            }
                                            // Keep the same name (parent or currentMillesime selected)
                                            return Rx.Observable.of(changeLayerProperties(action.id, {
                                                extendedParams: layer.extendedParams ? assign(layer.extendedParams, { millesimeManagement: millesimeManagement }) : {
                                                    millesimeManagement: millesimeManagement
                                                }
                                            }));
                                        }
                                    }

                                    if (getCFGGeonetwork('verbose')) {
                                        console.groupEnd()
                                        console.groupEnd()
                                    }
                                    // No Childrens but millesimeManagement
                                    if (millesimeManagement) {
                                        // Previous configuration with deleted childrens
                                        // Reset
                                        return Rx.Observable.of(changeLayerProperties(action.id, {
                                            extendedParams: layer.extendedParams ? assign(layer.extendedParams, { millesimeManagement: undefined }) : { millesimeManagement: undefined },
                                            name: layer.name
                                        }));
                                    }
                                    return Rx.Observable.of(loadedData('No childrens'))
                                })
                                .catch(function(e) {
                                    console.log(e);
                                    if (getCFGGeonetwork('verbose')) {
                                        console.groupEnd()
                                        console.groupEnd()
                                    }
                                    return Rx.Observable.of(loadError(e.message))
                                });
                        }
                        if (getCFGGeonetwork('verbose')) {
                            console.log('Cannot get childrens')
                            console.groupEnd()
                        }
                        // No Childrens but millesimeManagement
                        if (millesimeManagement) {
                            // Previous configuration with deleted childrens
                            // Reset
                            return Rx.Observable.of(changeLayerProperties(action.id, {
                                extendedParams: layer.extendedParams ? assign(layer.extendedParams, { millesimeManagement: undefined }) : { millesimeManagement: undefined },
                                name: layer.name
                            }));
                        }
                        return Rx.Observable.of(loadedData('No childrens'))
                    })
                    .catch(function(e) {
                        console.log(e);
                        if (getCFGGeonetwork('verbose')) {
                            console.groupEnd()
                        }
                        if (e.data && getGeoNetworkERROR(e.data) === 'Ressource introuvable.') {
                            // IF millesime ok, parent not found then replace parent by millesime
                            if (layer.extendedParams && layer.extendedParams.millesimeManagement && layer.extendedParams.millesimeManagement.currentMillesime) {
                                // Get millesime information
                                return Rx.Observable.defer(() => API.getRecordById(catalogURL, layer.extendedParams.millesimeManagement.currentMillesime))
                                    .switchMap(function(response) {
                                        try {
                                            var title = API.getTitleLayerFromJSON(response);
                                            var definition = API.getDefinitionLayerFromJSON(response);
                                            // Replace parent by millesime
                                            alert('La couche ' + layer.title + ' est introuvable. Elle sera remplacée par son millésime déjà sélectionné.')
                                            var urlPARTS = layer.catalogURL.split('?')
                                            var catalogURLParams = new URLSearchParams(urlPARTS[1]);
                                            catalogURLParams.set('id', layer.extendedParams.millesimeManagement.currentMillesime)
                                            return Rx.Observable.of(changeLayerProperties(layer.id, {
                                                description: definition,
                                                title: title,
                                                extendedParams: assign(layer.extendedParams, { millesimeManagement: null }),
                                                catalogURL: urlPARTS[0] + '?' + catalogURLParams.toString()
                                            }))
                                        } catch (e) {
                                            // Remove millesime if title and definition not found ?
                                            console.log(e)
                                            return Rx.Observable.empty();
                                        }
                                    })
                                    .catch(function(e) {
                                        // Cannot find millesime also
                                        return Rx.Observable.of(loadError(e.message))
                                    })
                            }
                        }
                        return Rx.Observable.of(loadError(e.message))
                    });
            }
            if (getCFGGeonetwork('verbose')) {
                console.groupEnd()
            }
            return Rx.Observable.empty();
        });
};

const onSetMillesimeSelected = (action$, store) => {
    // on each CREATE_NEW_FEATURE action triggered
    return action$.ofType(SET_MILLESIME_SELECTED)
        .switchMap((action) => {
            const state = store.getState();
            // Acces to millesimeManagement already existing
            var layer = getLayerFromId(state, action.parentMillesime);
            if (getCFGGeonetwork('verbose')) {
                console.group('| GeoNetworkPlugin | onSetMillesimeSelected')
                console.log('init layer state ->')
                console.dir(cloneDeep(layer))
            }
            var millesimeManagement = layer.extendedParams.millesimeManagement;
            var name = layer.name;
            var actions = []

            // Try to display a millesime
            if (action.currentMillesime) {
                // Get geospatial protocol of parent layer and find the same of millesime
                // If parent WFS -> millesime should WFS and same server
                if (find(millesimeManagement.layersList, {id: action.currentMillesime})) {
                    var millesimeLayer = find(millesimeManagement.layersList, {id: action.currentMillesime});
                    try {
                        name = API.getNameVSLayerFromJSON(millesimeLayer.record, layer);
                        millesimeManagement.currentMillesime = action.currentMillesime;
                    } catch (e) {
                        // Stay has before state
                        alert(e.message)
                    }
                }
            } else {
                // If millesime null -> unselected return parent name
                name = millesimeManagement.parentMillesime.name;
                millesimeManagement.currentMillesime = action.currentMillesime;
            }

            // Return only at the end, to not change the state if error
            if (getCFGGeonetwork('verbose')) {
                console.log('new layer properties ->')
                console.dir(cloneDeep(millesimeManagement))
                console.groupEnd()
            }
            actions.push(changeLayerProperties(layer.id, {
                extendedParams: layer.extendedParams ? assign(layer.extendedParams, { millesimeManagement: millesimeManagement }) : { millesimeManagement: millesimeManagement },
                name: name
            }))

            // Identify isOpen ?
            var clickPoint = clickPointSelector(state);
            if (clickPoint && mapInfoRequestsSelector(state).length !== 0) {
                actions.push(clickOnMap(clickPoint))
            }
            // Featuregrid is Open ?
            if (isFeatureGridOpen(state)) {
                actions.push(browseData({
                    id: layer.id,
                    name: name,
                    url: layer.url
                }));
                actions.push(resetQuery());
            }

            // Trigger all actions
            return Rx.Observable.from(actions);

        });
};

const synchronizeMillesimesOnMapLoaded = (action$, store) => {
    // on each CREATE_NEW_FEATURE action triggered
    return action$.ofType(MAP_CONFIG_LOADED)
        .switchMap((action) => {
            const state = store.getState();
            var actions = [];
            // Update Millesimelayers on each
            layersSelector(state).forEach(function(layer) {
                // Check if catalogURL exist (means CSW)
                var catalogURL = layer.catalogURL;
                if (catalogURL) {
                    actions.push(getMillesimeLayers(layer.id));
                }
            })
            if (getCFGGeonetwork('verbose')) {
                console.group('| GeoNetworkPlugin | synchronizeMillesimesOnMapLoaded')
                console.log('init state ->')
                console.dir(cloneDeep(state))
            }
            return Rx.Observable.from(actions);
        });
};

const onRemoveLayerFindParentSelected = (action$, store) => {
    // on each CREATE_NEW_FEATURE action triggered
    return action$.ofType(REMOVE_NODE)
        .switchMap((action) => {
            // Epic enabled ?
            if (!getCFGGeonetwork('millesimeLayers')) {
                return Rx.Observable.empty();
            }

            const state = store.getState();
            const actualParentSelected = get(state, "geonetworkExtension.parentSelected");
            // Check if parentSelected is the layer wanted to remove
            if (action.nodeType === "layers" && actualParentSelected && actualParentSelected.id && actualParentSelected.id === action.node) {
                return Rx.Observable.of(setParentSelected(null));
            }
            return Rx.Observable.empty();
        });
};

/* EXPORTS */
export default {
    loadFeatureAttributeEpic,
    toggleDisplayColumnOrganismeEpic,
    editNewFeatureOrganisme,
    updateMillesimeButtonPosition,
    onAddLayerFindMillesime,
    onGetMillesimesLayers,
    onSetMillesimeSelected,
    synchronizeMillesimesOnMapLoaded,
    onRemoveLayerFindParentSelected
};