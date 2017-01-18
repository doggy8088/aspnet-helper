import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import { Property, GetParts } from '../parsingResults';

export default class ModelDeclarationInfo {

    private _document: vscode.TextDocument;
    
    constructor(document: vscode.TextDocument) {
        this._document = document;
    }

    public userWantsProperties(input: string): boolean {
        let userRegExp = /.*@Model\.?$/;
        if (userRegExp.test(input)) return true;
        return false
    }

    public userWantsSingleProperty(input: string): boolean {
        let userRegExp = /.*@Model\.[a-zA-Z]*$/;
        if (userRegExp.test(input)) return true;
        return false
    }

    public getCurrentModel(): string {
        let firstLine = this._document.lineAt(0).text;
        let modelRegExp = /.?model\s(.*)$/
        let model = GetParts(firstLine, modelRegExp);
        if (model) return model[1];
        return '';
    }

    public getNamespaces(): string[] {

        let files = this.getViewImportsFiles();
        let namespaces = this.getNamespacesFromFiles(files);
        return namespaces
    }

    private getViewImportsFiles(): string[] {
        let currentDir = this._document.uri.fsPath;
        let files: string[] = [];

        while (currentDir !== vscode.workspace.rootPath) {
            currentDir = path.dirname(currentDir);
            fs.readdirSync(currentDir).forEach(f => {
                if (f.includes('_ViewImports.cshtml')) files.push(currentDir + path.sep + f);
            });
        }

        return files;
    }

    private getNamespacesFromFiles(files: string[]): string[] {
        let namespaces: string[] = [];
        let namespaceRegExp = /@using\s(.*)/;
        files.forEach(f => {
            let text = fs.readFileSync(f, 'utf8');
            let results = text.match(namespaceRegExp);
            results.forEach(r => { 
                let namespace = GetParts(r, new RegExp(namespaceRegExp.source));
                if (namespace) namespaces.push(namespace[1]);
            })
        });
        return namespaces;
    }

    public getProperties(model: string, namespaces: string[]): Property[] {
        let matchingFiles: string[] = this.getMatchingFiles(model, namespaces);
        
        if (!matchingFiles) return new Array<Property>()

        let text = fs.readFileSync(matchingFiles[0], 'utf8');
        let propRegExp = /public\s([a-zA-Z]*<?[a-zA-Z]+>?)\s([a-zA-Z]+)/g;
        let fullProps = text.match(propRegExp);
        
        if (!fullProps) return new Array<Property>();
        
        fullProps = fullProps.filter(f => !f.includes('class'));
        let items = new Array<Property>();
        fullProps.forEach(p => {
            let results = GetParts(p, new RegExp(propRegExp.source));
            let item = new Property();
            item.type = results[1];
            item.name = results[2];
            items.push(item);
        });
        return items;
    }

    public convertPropertiesToCompletionItems(properties: Property[]): vscode.CompletionItem[] {
        let items = new Array<vscode.CompletionItem>();
        properties.forEach(p => { 
            let item = new vscode.CompletionItem(p.name);
            item.kind = vscode.CompletionItemKind.Property;
            item.detail = p.type;
            items.push(item);
        });
        return items;
    }

    public convertPropertiesToHoverResult(property:Property): vscode.Hover {
        let text = property.type + ' ' + property.name;
        let markedString: vscode.MarkedString;
        markedString = {
            language: 'csharp',
            value: text
        };
        return new vscode.Hover(markedString);
    }

    private getMatchingFiles(model: string, namespaces: string[]): string[] {
        let modelsPattern = vscode.workspace.rootPath + path.sep + '**\\Models\\**\\*.cs';
        let viewModelsPattern = vscode.workspace.rootPath + path.sep + '**\\ViewModels\\**\\*.cs';
        let files = glob.sync(modelsPattern).concat(glob.sync(viewModelsPattern));
        let matchingFiles: string[] = [];
        namespaces.forEach(n => {
            files.forEach(f => {
                if (this.isMatchingFile(model, n, f)) matchingFiles.push(f); 
            });
        });
        return matchingFiles;
    }

    private isMatchingFile(model: string, namespace: string, file: string): string {
        let text = fs.readFileSync(file, 'utf8');
        let namespaceRegExp = new RegExp('namespace\\s' + namespace);
        let classNameRegExp = new RegExp('class\\s' + model);

        if (namespaceRegExp.test(text) && classNameRegExp.test(text)) return file;

        return '';
    }

}